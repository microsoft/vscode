# Map Server Integration

This guide provides instructions on how to integrate various map servers and services (such as Mapbox, Leaflet, or Google Maps API) with the platform to enable dynamic, interactive geolocation features.

[**Note:** The specific integration steps will vary based on the chosen map service and how the platform's frontend and backend are structured. This guide offers a general approach and examples for common services.]

## Overview

Integrating a map server allows the platform to:
*   Display interactive maps.
*   Visualize location-based data (e.g., points of interest, user locations, asset tracking).
*   Implement geolocation features (e.g., searching for nearby items, geocoding addresses, calculating routes).
*   Allow users to input or select locations on a map.

Commonly Used Map Services:
*   **Leaflet:** An open-source JavaScript library for mobile-friendly interactive maps. Highly extensible with plugins. Requires a tile server for map imagery (e.g., OpenStreetMap, Mapbox, custom).
*   **Mapbox GL JS:** A JavaScript library that uses WebGL to render interactive maps from vector tiles and Mapbox styles. Offers powerful customization and rich datasets. Commercial, with a generous free tier.
*   **Google Maps Platform:** A comprehensive suite of APIs (Maps JavaScript API, Geocoding API, Places API, Routes API, etc.). Commercial, with a monthly free credit.
*   **OpenLayers:** Another powerful open-source option, capable of handling various map sources.

## General Integration Steps

1.  **Choose a Map Service:** Select a service based on your feature requirements, budget, licensing, and customization needs.
2.  **Obtain API Key/Access Token:** Most commercial map services require an API key or access token. Sign up for an account with the chosen provider and secure your key.
3.  **Configure API Key:** Store the API key securely, typically as an environment variable, and make it available to your frontend and/or backend as needed.
    *   **Frontend:** The API key might be embedded during the build process or fetched from a secure backend endpoint. **Avoid exposing unrestricted API keys directly in client-side code if possible.** Some services offer domain-restricted keys for client-side use.
    *   **Backend:** For server-side API calls (e.g., geocoding, routing), the API key is used directly by the backend service.
    ```
    # .env example
    MAPBOX_ACCESS_TOKEN=pk.your_mapbox_access_token
    GOOGLE_MAPS_API_KEY=AIzaSyYourGoogleMapsApiKey
    ```
4.  **Install SDK/Library:** Include the necessary JavaScript library for the chosen map service in your frontend application.
    ```bash
    # For Mapbox GL JS
    npm install mapbox-gl
    # or yarn add mapbox-gl

    # For Leaflet
    npm install leaflet
    # or yarn add leaflet

    # For Google Maps (often loaded via a script tag, but can be wrapped)
    # No direct npm package for the core JS API, but wrappers exist.
    ```
5.  **Create Map Components:** Develop reusable UI components (e.g., Vue, React, Angular components) to encapsulate map rendering and interaction logic.
6.  **Backend Integration (Optional):** For features like geocoding, reverse geocoding, route calculations, or storing/querying geospatial data, you'll need backend integration.

## Integrating Specific Map Services

### 1. Leaflet

Leaflet is lightweight and flexible. You'll need Leaflet's JavaScript and CSS, plus a tile layer provider.

**a. Installation & Setup:**
   ```bash
   npm install leaflet
   # or yarn add leaflet
   ```
   Import CSS (e.g., in your main JS/TS file or component):
   ```javascript
   import 'leaflet/dist/leaflet.css';
   ```

**b. Creating a Basic Leaflet Map Component (Example: Vue.js)**
   ```vue
   <template>
     <div :id="mapId" style="height: 400px; width: 100%;"></div>
   </template>

   <script>
   import L from 'leaflet';
   // Optional: Fix for default icon path issues with bundlers
   import 'leaflet/dist/images/marker-shadow.png';
   import 'leaflet/dist/images/marker-icon-2x.png';

   export default {
     name: 'LeafletMap',
     props: {
       center: { type: Array, default: () => [51.505, -0.09] }, // Latitude, Longitude
       zoom: { type: Number, default: 13 },
       tileLayerUrl: {
         type: String,
         default: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' // Default to OpenStreetMap
       },
       tileLayerOptions: {
         type: Object,
         default: () => ({
           attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
         })
       }
     },
     data() {
       return {
         map: null,
         mapId: `leaflet-map-${Math.random().toString(36).substring(2, 9)}`
       };
     },
     mounted() {
       // Optional: Fix for default icon path issues
       delete L.Icon.Default.prototype._getIconUrl;
       L.Icon.Default.mergeOptions({
         iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
         iconUrl: require('leaflet/dist/images/marker-icon.png'),
         shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
       });

       this.map = L.map(this.mapId).setView(this.center, this.zoom);
       L.tileLayer(this.tileLayerUrl, this.tileLayerOptions).addTo(this.map);
     },
     beforeUnmount() {
       if (this.map) {
         this.map.remove();
       }
     },
     methods: {
       addMarker(latLng, popupContent = '') {
         if (this.map) {
           const marker = L.marker(latLng).addTo(this.map);
           if (popupContent) {
             marker.bindPopup(popupContent);
           }
           return marker;
         }
       }
       // ... other methods to interact with the map (add polygons, etc.)
     }
   };
   </script>
   ```
   [**Provide similar examples for React/Angular if relevant to the platform.**]

**c. Tile Layers:**
   *   **OpenStreetMap (Free):** `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
   *   **Mapbox Tiles (Requires Access Token):** Use Mapbox Static Tiles API or Mapbox GL JS for vector tiles. If using Leaflet with Mapbox raster tiles: `https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={your_access_token}`
   *   **Stadia Maps (formerly Stamen):** Offer artistic tile sets.
   *   **Custom Tile Server:** If you host your own.

### 2. Mapbox GL JS

Mapbox GL JS uses WebGL for high-performance vector maps and offers rich styling capabilities.

**a. Installation & Setup:**
   ```bash
   npm install mapbox-gl
   # or yarn add mapbox-gl
   ```
   Import CSS:
   ```javascript
   import 'mapbox-gl/dist/mapbox-gl.css';
   ```

**b. Configuring Access Token:**
   Set your Mapbox access token. This can be done globally or when creating a map instance.
   ```javascript
   // In your main application file or map component
   import mapboxgl from 'mapbox-gl';
   mapboxgl.accessToken = 'YOUR_MAPBOX_ACCESS_TOKEN'; // Fetch from env var or config
   ```

**c. Creating a Basic Mapbox GL JS Component (Example: React)**
   ```jsx
   import React, { useRef, useEffect, useState } from 'react';
   import mapboxgl from 'mapbox-gl';

   // Ensure accessToken is set (e.g., in your app's entry point or here from an env var)
   // mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

   const MapboxMap = ({ initialCenter = [-74.5, 40], initialZoom = 9, style = 'mapbox://styles/mapbox/streets-v11' }) => {
     const mapContainerRef = useRef(null);
     const mapRef = useRef(null);
     const [lng, setLng] = useState(initialCenter[0]);
     const [lat, setLat] = useState(initialCenter[1]);
     const [zoom, setZoom] = useState(initialZoom);

     useEffect(() => {
       if (mapRef.current) return; // Initialize map only once
       if (!mapboxgl.accessToken) {
         console.error("Mapbox Access Token is not set.");
         return;
       }

       mapRef.current = new mapboxgl.Map({
         container: mapContainerRef.current,
         style: style,
         center: [lng, lat],
         zoom: zoom
       });

       mapRef.current.on('move', () => {
         setLng(mapRef.current.getCenter().lng.toFixed(4));
         setLat(mapRef.current.getCenter().lat.toFixed(4));
         setZoom(mapRef.current.getZoom().toFixed(2));
       });

       return () => mapRef.current.remove(); // Clean up on unmount
     }, [style, lng, lat, zoom]); // Re-run effect if these props change (though center/zoom are typically controlled internally after init)


     return (
       <div>
         <div style={{ position: 'absolute', background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '5px', zIndex: 1 }}>
           Longitude: {lng} | Latitude: {lat} | Zoom: {zoom}
         </div>
         <div ref={mapContainerRef} style={{ height: '400px', width: '100%' }} />
       </div>
     );
   };

   export default MapboxMap;
   ```

**d. Map Styles:** Mapbox offers various default styles (e.g., `mapbox://styles/mapbox/streets-v11`, `mapbox://styles/mapbox/outdoors-v11`, `mapbox://styles/mapbox/satellite-v9`) or you can create custom styles in Mapbox Studio.

### 3. Google Maps Platform (Maps JavaScript API)

Google Maps is typically loaded via a `<script>` tag in your `index.html` or dynamically.

**a. Loading the API:**
   In your `public/index.html` (or equivalent):
   ```html
   <script async defer src="https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&callback=initMap">
   </script>
   ```
   Ensure `YOUR_GOOGLE_MAPS_API_KEY` is replaced. The `callback=initMap` means a global function `initMap` will be called when the API is loaded. Modern SPAs often use loader libraries to handle this more gracefully.

**b. Using a Loader Library (Example: `@googlemaps/js-api-loader`)**
   ```bash
   npm install @googlemaps/js-api-loader
   # or yarn add @googlemaps/js-api-loader
   ```
   ```javascript
   // In your map component
   import { Loader } from '@googlemaps/js-api-loader';

   const loader = new Loader({
     apiKey: "YOUR_GOOGLE_MAPS_API_KEY", // Fetch from env var or config
     version: "weekly",
     libraries: ["places", "geocoding"] // Optional: load specific libraries
   });

   loader.load().then((google) => {
     // new google.maps.Map(mapElement, mapOptions);
     // Now you can use google.maps.*
   }).catch(e => {
     console.error("Failed to load Google Maps API", e);
   });
   ```

**c. Creating a Basic Google Map Component (Example: Generic JavaScript, adaptable to frameworks)**
   ```javascript
   // Assuming HTML: <div id="google-map-container" style="height: 400px; width: 100%;"></div>

   let map;

   function initMap() { // This is the callback function if using the script tag method
     if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.error('Google Maps API not loaded yet.');
        // Optionally, use the loader approach here if initMap is called too early or for more control
        return;
     }
     map = new google.maps.Map(document.getElementById("google-map-container"), {
       center: { lat: -34.397, lng: 150.644 },
       zoom: 8,
     });
   }

   // If not using the script tag callback, you'd call a similar function after the loader promise resolves.

   // Example function to add a marker
   function addGoogleMarker(position, title = '') {
     if (map && typeof google !== 'undefined') {
       const marker = new google.maps.Marker({
         position: position, // e.g., { lat: -34.397, lng: 150.644 }
         map: map,
         title: title
       });
       return marker;
     }
   }
   ```
   [**Provide framework-specific wrappers for Google Maps if common in your platform.**]

## Common Geolocation Features

### Displaying Markers
All map libraries provide ways to add markers for specific coordinates. This is useful for showing points of interest, user locations, etc.
*   **Data Source:** Coordinates can come from your database, user input, or external APIs.
*   **Clustering:** For many markers, use marker clustering libraries (e.g., `Leaflet.markercluster`, `Supercluster` for Mapbox/React, Google Maps has its own utility).

### User Interaction
*   **Clicking on Map:** Get coordinates from a map click.
*   **Popups/InfoWindows:** Display information when a marker or feature is clicked.
*   **Drawing Shapes:** Allow users to draw polygons, circles, or lines (useful for defining areas of interest). Leaflet has `Leaflet.draw`, Mapbox and Google Maps have drawing libraries/modules.

### Geocoding and Reverse Geocoding
*   **Geocoding:** Convert addresses to geographic coordinates (latitude/longitude).
*   **Reverse Geocoding:** Convert coordinates to human-readable addresses.
*   **Implementation:**
    *   **Client-Side:** Some libraries offer client-side geocoding (e.g., Mapbox Geocoding, Google Geocoding API via JavaScript SDK). Be mindful of API usage limits and costs.
    *   **Server-Side:** For batch geocoding, higher security, or to hide API keys, perform geocoding via backend API calls to the map provider's services.
        *   Example: Your backend receives an address, calls the Google Geocoding API, and returns the coordinates.

**Example Server-Side Geocoding (Conceptual Node.js using an API client):**
```javascript
// const axios = require('axios');
// const GEOCODING_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// async function geocodeAddress(address) {
//   try {
//     const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
//       params: {
//         address: address,
//         key: GEOCODING_API_KEY
//       }
//     });
//     if (response.data.status === 'OK' && response.data.results.length > 0) {
//       return response.data.results[0].geometry.location; // { lat, lng }
//     } else {
//       throw new Error(response.data.status || 'Geocoding failed');
//     }
//   } catch (error) {
//     console.error('Geocoding error:', error);
//     throw error;
//   }
// }
```

### Storing and Querying Geospatial Data
If your platform needs to store and query location data (e.g., "find all items within 5km"):
*   **Database Support:** Use a database with geospatial capabilities (e.g., PostgreSQL with PostGIS, MongoDB with 2dsphere indexes, Elasticsearch with geo_point).
*   **Data Format:** Store coordinates as `latitude` and `longitude` (numbers) or in a specific geospatial data type (e.g., PostGIS `geometry` or `geography`). GeoJSON is a common format for representing geospatial features.
*   **Backend Logic:** Implement backend APIs to perform spatial queries.

## Best Practices
*   **Secure API Keys:** Never expose unrestricted API keys in client-side code. Use backend proxies, server-side calls, or key restriction features provided by the map service (e.g., HTTP referrer restrictions for Google Maps, public token scopes for Mapbox).
*   **Asynchronous Loading:** Load map scripts and initialize maps asynchronously to avoid blocking page rendering.
*   **Performance:**
    *   Use vector tiles where possible for better performance and customization (Mapbox, or Leaflet with vector tile plugins).
    *   Implement marker clustering for large numbers of points.
    *   Optimize data loading for map layers.
*   **User Experience:**
    *   Provide clear loading states for maps.
    *   Ensure maps are responsive and accessible.
*   **Cost Management:** Be aware of the pricing models for commercial map services and monitor your API usage to avoid unexpected costs. Implement client-side and server-side caching where appropriate.
*   **Modularity:** Create reusable map components to encapsulate map logic and make it easy to use maps throughout your application.

By following this guide and the documentation for your chosen map service, you can effectively integrate rich mapping and geolocation features into your platform. Remember to adapt the examples to your specific frontend framework and backend language.
