# Build Stage: Compiles the Go application
FROM golang:1.25 AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy the Go module files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the application source code
COPY . .

# Build the Go application, linking it statically for better performance
# CGO_ENABLED=0 is critical for static linking, improving portability.
RUN CGO_ENABLED=0 go build -tags netgo -o /go-app .

# Final Stage: Runs the compiled binary and static assets
FROM debian:bullseye-slim

# Set the working directory
WORKDIR /app

# Install the PostgreSQL client libraries required by the lib/pq driver
# This is necessary for the Go binary to connect to the database securely.
RUN apt-get update && apt-get install -y libpq-dev --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy the static frontend assets (index.html, app.js, style.css)
COPY static static/

# Copy the compiled application from the builder stage
COPY --from=builder /go-app .

# Set the required environment variables for the database connection
ENV PORT=8080

# Run the Go binary
CMD ["/app/go-app"]
