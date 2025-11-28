package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	
	// Use the recommended standard PostgreSQL driver
	// Run: go get github.com/lib/pq
	_ "github.com/lib/pq"
)

// Global database connection pool
var db *sql.DB

func main() {
	// 1. Initialize Database Connection
	// This function handles connection both locally (via Proxy) and on App Engine (via Unix socket).
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 2. Set up HTTP Handlers
	// Serves the frontend static files (HTML, CSS, JS) from the 'static' directory.
	http.Handle("/", http.FileServer(http.Dir("static")))

	// API endpoint for store search - This name MUST match the BACKEND_API_URL in app.js
	http.HandleFunc("/api/search", apiSearchHandler)

	// 3. Start the Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Store Locator Backend (Go) listening on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

// initDB establishes the connection to the Cloud SQL instance
func initDB() error {
	// Credentials retrieved from App Engine environment variables (or local shell)
	instanceConnectionName := os.Getenv("INSTANCE_CONNECTION_NAME")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	// Fallback/Local values
	if dbUser == "" { dbUser = "postgres" }
	if dbName == "" { dbName = "recycling_db" }

	var connectionString string

	// Check if running on App Engine (using unix socket)
	if instanceConnectionName != "" {
		connectionString = fmt.Sprintf("user=%s password=%s database=%s host=/cloudsql/%s",
			dbUser, dbPassword, dbName, instanceConnectionName)
	} else {
		// Local development via Cloud SQL Proxy (tcp connection)
		if dbPassword == "" {
			log.Println("WARNING: DB_PASSWORD environment variable not set. Assuming unsecure local connection.")
		}
		// FIX: Explicitly disable SSL for local connection via the proxy
		connectionString = fmt.Sprintf("host=127.0.0.1 port=5432 user=%s password=%s database=%s sslmode=disable",
			dbUser, dbPassword, dbName)
	}

	var err error
	db, err = sql.Open("postgres", connectionString)
	if err != nil {
		return fmt.Errorf("sql.Open failed: %w", err)
	}

	// Configure pool settings (adopted from locations.go logic)
	db.SetMaxIdleConns(5)
	db.SetMaxOpenConns(7)
	db.SetConnMaxLifetime(1800)
	
	// Verify connection
	if err = db.Ping(); err != nil {
		return fmt.Errorf("db.Ping failed: %w", err)
	}

	log.Printf("Successfully connected to database: %s", dbName)
	return nil
}

// apiSearchHandler handles the request from app.js and returns GeoJSON.
// This replaces dropoffsHandler from locations.go and uses the correct /api/search route.
func apiSearchHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-type", "application/json")
	
	// NOTE: App.js uses URL query parameters (r.URL.Query().Get), not r.FormValue
	centerLatStr := r.URL.Query().Get("lat")
	centerLngStr := r.URL.Query().Get("lng")
	
	// Radius in meters (app.js defaults to 10000m)
	radiusMetersStr := r.URL.Query().Get("radius") 
	if radiusMetersStr == "" {
		radiusMetersStr = "10000"
	}
	
	// Basic validation for search coordinates
	if centerLatStr == "" || centerLngStr == "" {
		http.Error(w, `{"error": "Missing latitude or longitude parameter"}`, http.StatusBadRequest)
		return
	}
	
	geoJSON, err := getGeoJSONFromDatabase(centerLatStr, centerLngStr, radiusMetersStr)
	if err != nil {
		str := fmt.Sprintf(`{"status": "error", "error": "Internal server error during query: %s"}`, err)
		http.Error(w, str, http.StatusInternalServerError)
		return
	}
	
	// Add the "status: ok" wrapper around the GeoJSON response for the frontend JS to process
	finalResponse := fmt.Sprintf(`{"status": "ok", "features": %s}`, geoJSON)
	
	fmt.Fprintf(w, finalResponse)
}

// getGeoJSONFromDatabase executes the PostGIS query and returns raw GeoJSON string.
func getGeoJSONFromDatabase(centerLatStr string, centerLngStr string, radiusMetersStr string) (string, error) {

	// Convert string parameters to floats/ints for the query
	centerLat, err := strconv.ParseFloat(centerLatStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid latitude: %w", err)
	}
	centerLng, err := strconv.ParseFloat(centerLngStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid longitude: %w", err)
	}
	radiusMeters, err := strconv.Atoi(radiusMetersStr)
	if err != nil {
		return "", fmt.Errorf("invalid radius: %w", err)
	}
	
	const tableName = "austinrecycling"

	// This robust query uses the ST_DWithin check and aggregates the results into a single GeoJSON array.
	// NOTE: The table name 'austinrecycling' and geometry column 'wkb_geometry' are assumed from your GeoJSON import.
	var queryStr = fmt.Sprintf(
		`SELECT COALESCE(jsonb_agg(t.feature), '[]'::jsonb)
		FROM (
			SELECT jsonb_build_object(
				'type', 'Feature',
				'geometry', ST_AsGeoJSON(wkb_geometry)::jsonb,
				'properties', to_jsonb(row) - 'ogc_fid' - 'wkb_geometry'
			) AS feature
			FROM (
				SELECT *, 
					-- Calculate distance in KM
					ST_Distance(
						ST_GEOGFromWKB(wkb_geometry), 
						ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography 
					) / 1000 AS distance_km
				FROM %v
				WHERE ST_DWithin(
					ST_GEOGFromWKB(wkb_geometry), 
					ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
					$3 -- Radius in meters
				)
				ORDER BY distance_km
				LIMIT 25
			) row
		) t;
		`, tableName)

	// Log the query string for debugging (removed from production logs for security/verbosity)
	// log.Println(queryStr) 

	// $1 = Longitude, $2 = Latitude, $3 = Radius in Meters
	row := db.QueryRow(queryStr, centerLng, centerLat, radiusMeters)
	
	var featureCollection string
	err = row.Scan(&featureCollection)

	// Handle the case where the query returns no data (e.g., empty set)
	if err == sql.ErrNoRows {
		return "[]", nil // Return an empty GeoJSON array
	} else if err != nil {
		return "", fmt.Errorf("error scanning row: %w", err)
	}

	return featureCollection, nil
}