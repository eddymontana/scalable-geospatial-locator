/**
 * Store Locator Application Logic (Full-Stack Frontend)
 * NOTE: This version is compatible with index.html, uses the correct global callback (window.initMap), 
 * implements the database search feature, and uses modern Google Maps Advanced Markers.
 */

// Global variables for the map and markers
let map;
let infoWindow;
let markers = [];
const BACKEND_API_URL = '/api/search'; 

const AUSTIN_COORDS = { lat: 30.2672, lng: -97.7431 }; 

// CRITICAL FIX: Expose initMap globally for the Google Maps API callback to resolve "initMap is not a function"
window.initMap = function() {
    console.log("Google Maps API loaded. Initializing map...");
    
    map = new google.maps.Map(document.getElementById('map'), {
        center: AUSTIN_COORDS,
        zoom: 12,
        mapId: 'STORE_LOCATOR_MAP_ID',
    });

    infoWindow = new google.maps.InfoWindow();
    
    // Set up event listeners on the search button element from index.html
    const searchButton = document.getElementById('search-button');
    if (searchButton) {
        // The click handler that initiates the Geocoding and Backend API call
        searchButton.addEventListener('click', handleSearch);
    } else {
        console.error("Error: Search button element not found!");
    }
    
    // Initial load of stores using the default Austin coordinates
    fetchStores(AUSTIN_COORDS);
}

/**
 * Handles the user search action: Geocodes the address input and fetches store data.
 */
function handleSearch() {
    const addressInput = document.getElementById('address-input');
    const address = addressInput.value.trim();

    if (!address) {
        alertMessage('Please enter an address or location for the search.', 'warning');
        return;
    }

    // Geocode the user's input address (converts address string to Lat/Lng coordinates)
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: address }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const location = results[0].geometry.location;
            
            map.setCenter(location);
            map.setZoom(13);
            
            // Call the Go backend with the new coordinates
            fetchStores({ lat: location.lat(), lng: location.lng() });

        } else {
            alertMessage(`Geocoding failed for "${address}". Status: ${status}`, 'error');
        }
    });
}

/**
 * Calls the Go backend API to retrieve nearby store locations (GeoJSON).
 * This is the crucial backend integration step.
 * @param {object} centerCoords - {lat: number, lng: number}
 */
async function fetchStores(centerCoords) {
    const { lat, lng } = centerCoords;
    const url = `${BACKEND_API_URL}?lat=${lat}&lng=${lng}&radius=10000`; 

    const listElement = document.getElementById('store-list');
    listElement.innerHTML = '<p class="p-4 text-center text-gray-500">Searching database...</p>';
    clearMarkers();
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Data is expected to be a GeoJSON FeatureCollection from your Go backend
        const geoJson = await response.json(); 
        
        if (geoJson.status === 'ok' && geoJson.features && geoJson.features.length > 0) {
             displayFeatures(geoJson.features);
             alertMessage(`${geoJson.features.length} locations found!`, 'success');

        } else if (geoJson.status === 'ok' && geoJson.features.length === 0) {
             listElement.innerHTML = '<p class="p-4 text-center text-gray-500">No locations found within 10 km radius.</p>';
        } else {
             // Handle explicit error from backend (e.g., database connection failure logged in Go)
             throw new Error(geoJson.error || "Backend returned an unspecified error.");
        }

    } catch (error) {
        console.error("Failed to fetch stores from backend:", error);
        alertMessage(`⚠️ Backend error: ${error.message}. Is the Cloud SQL Proxy running or is DB_PASSWORD set?`, 'error');
    }
}


/**
 * Clears existing markers from the map.
 */
function clearMarkers() {
    markers.forEach(marker => marker.map = null); 
    markers = [];
}

/**
 * Processes and displays GeoJSON features on the map and in the sidebar.
 * @param {Array<Object>} features - Array of GeoJSON Feature objects
 */
function displayFeatures(features) {
    const listElement = document.getElementById('store-list');
    listElement.innerHTML = ''; 

    features.forEach((feature, index) => {
        const properties = feature.properties;
        const coords = feature.geometry.coordinates;
        
        // GeoJSON uses [lng, lat], Google Maps uses {lat, lng}
        const position = { lat: coords[1], lng: coords[0] }; 

        // --- 1. Create Advanced Marker on Map ---
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: position,
            map: map,
            title: properties.name,
            content: createMarkerContent(index + 1),
        });

        const storeData = {
            name: properties.name,
            address: properties.address,
            distance: properties.distance_km,
            hours: "9:00 AM - 8:00 PM (Mock)" // Hours are not in the raw data, use mock
        };

        // Add event listener for InfoWindow on marker click
        marker.addListener('click', () => {
            showStoreDetails(marker, storeData);
        });

        markers.push(marker);

        // --- 2. Create Card in Sidebar ---
        const card = document.createElement('div');
        card.className = 'store-card';
        card.setAttribute('data-index', index);
        card.innerHTML = `
            <div class="store-info">
                <h3>${storeData.name}</h3>
                <p>${storeData.address}</p>
                <p class="text-xs text-blue-600">${storeData.hours}</p>
            </div>
            <div class="distance-info">
                <span class="font-bold text-lg">${storeData.distance}</span>
                <span class="text-sm text-gray-500">km</span>
            </div>
        `;
        
        // Center map on card click
        card.addEventListener('click', () => {
            map.setCenter(position);
            map.setZoom(14);
            showStoreDetails(marker, storeData);
        });

        listElement.appendChild(card);
    });
}

/**
 * Creates custom HTML content for the Advanced Marker.
 */
function createMarkerContent(label) {
    const pin = document.createElement('div');
    pin.className = 'pin-label';
    pin.textContent = label;
    return pin;
}

/**
 * Shows detailed information about the store in the InfoWindow.
 */
function showStoreDetails(marker, store) {
    const content = `
        <div class="p-2">
            <h4 class="font-bold text-lg">${store.name}</h4>
            <p class="text-sm text-gray-700 mb-2">${store.address}</p>
            <hr class="my-2">
            <p class="text-xs"><strong>Hours:</strong> ${store.hours}</p>
            <p class="text-xs"><strong>Distance:</strong> ${store.distance} km</p>
            
            <hr class="my-2">
            <h5 class="font-semibold text-sm text-green-600">Environmental Data:</h5>
            <p class="text-xs">AQI: Fetching...</p>
            <p class="text-xs">Weather: Fetching...</p>
        </div>
    `;

    infoWindow.setContent(content);
    infoWindow.open(map, marker);
}

/**
 * Displays a non-intrusive message.
 */
function alertMessage(message, type) {
    console.warn(`[${type.toUpperCase()}] ${message}`);
    const list = document.getElementById('store-list');
    const msgElement = document.createElement('p');
    msgElement.className = `p-4 font-semibold ${type === 'error' ? 'text-red-600' : (type === 'success' ? 'text-green-600' : 'text-yellow-600')}`;
    msgElement.textContent = message;
    
    list.prepend(msgElement);
    
    setTimeout(() => {
        msgElement.remove();
    }, 5000);
}