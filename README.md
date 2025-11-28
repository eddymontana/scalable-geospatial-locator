🚀 High-Performance Geospatial Store Locator (Go, PostGIS, Cloud Run)

🎯 Architectural Overview and Goal

The primary objective was to build a cost-efficient system capable of providing sub-second nearest-neighbor search results based on user input, proving mastery over modern cloud native technologies and advanced geospatial data management.

Extended Project Description

This project serves as a showcase of a fully containerized, serverless approach to solving complex real-world logistics and retail problems. Unlike simple map embeds or traditional database solutions, this architecture prioritizes speed, cost-efficiency, and true geographical intelligence.

The solution operates as a geospatial microservice, where the fast Go backend handles all compute and data logic, freeing the frontend for presentation. This architecture ensures high concurrency and resilience against failure, vital for peak usage scenarios. The service leverages the Cloud Run environment for true autoscaling, meaning resources only spin up when a user performs a search and scale down to zero when idle, demonstrating a deep understanding of optimized cloud infrastructure costs (a core value for an AI/ML Engineer). The successful transition from the brittle App Engine Flexible environment to this robust containerized solution highlights advanced deployment and troubleshooting expertise.

Architecture Diagram

🛠️ Tech Stack & Key Components

This project showcases expertise across the development stack:

Layer

Technology

Key Components/Skills Demonstrated

Backend / Microservice

GoLang on Cloud Run

Serverless computing, high concurrency, fast startup times, Dockerization.

Data Layer

Google Cloud SQL + PostGIS

Geospatial data storage, spatial indexing, complex nearest-neighbor querying (ST_DWithin).

Frontend

HTML/JS + Google Maps Platform

Responsive UI, modern Geocoding API, and use of Advanced Markers.

DevOps / CI/CD

Docker + Cloud Build

Containerization, multi-stage builds (Dockerfile), and successful deployment pipeline (cloudbuild.yaml).

🧠 Core Technical Achievement (PostGIS Query)

The critical component is the high-performance database interaction. Instead of fetching large datasets, the Go backend executes a PostGIS query that calculates the distance and filters the results on the server-side, returning only the nearest locations as optimized GeoJSON.

Go Function: getGeoJSONFromDatabase in main.go

SQL Logic: Uses ST_DWithin and ST_GEOGFromWKB to find points within a 10km radius of the user's latitude/longitude.

🌐 Project Status

The application was successfully deployed and verified live on Cloud Run.

Current Live Status: OFFLINE (Project deleted to avoid incurring recurring charges).

Proof of Work: All code, deployment files (Dockerfile, cloudbuild.yaml), and logic are contained within this repository.

⚙️ How to Deploy This Project

This guide assumes you have a GCP project and a Cloud SQL (PostgreSQL) instance with the PostGIS extension enabled.

Prepare Data: Ensure data/recycling-locations.geojson exists and has been imported into your database as the austinrecycling table.

Set Secrets: Update the database credentials in cloudbuild.yaml:

DB_PASSWORD

INSTANCE_CONNECTION_NAME (Set to <PROJECT_ID>:<REGION>:<INSTANCE_ID>)

Deploy to Cloud Run (Final Command):

gcloud builds submit --config cloudbuild.yaml


