# Map Server Integration

This guide provides instructions on how to integrate various map servers and services (such as Mapbox, Leaflet with OpenStreetMap, or Google Maps API) with the Autonomous Coding Agent platform's React frontend to enable dynamic, interactive geolocation features.

## Overview

Integrating a map server allows the platform to:
*   Display interactive maps, for instance, to visualize locations relevant to projects or user activity.
*   Visualize location-based data (e.g., points of interest, data centers, team member locations if applicable).
*   Potentially implement geolocation features if relevant to coding tasks (e.g., tasks related to location-based services).
*   Allow users to input or select locations on a map for specific configurations.

Commonly Used Map Services suitable for a React frontend:
*   **Leaflet:** An open-source JavaScript library for mobile-friendly interactive maps. Highly extensible. Requires a tile server for map imagery (e.g., OpenStreetMap is a common free option).
*   **Mapbox GL JS:** A JavaScript library using WebGL to render interactive maps from vector tiles and Mapbox styles. Offers powerful customization. Commercial, with a generous free tier.
*   **Google Maps Platform (React Components):** Libraries like `@vis.gl/react-google-maps` provide React components for Google Maps. Commercial, with a monthly free credit.
*   **React-Leaflet:** React components for Leaflet, simplifying integration.

## General Integration Steps

1.  **Choose a Map Service:** Select based on features, cost, licensing, and ease of integration with React. For this guide, we'll focus on Leaflet (via `react-leaflet`) and Mapbox GL JS.
2.  **Obtain API Key/Access Token (if required):**
    *   **Mapbox:** Requires an access token. Sign up at [mapbox.com](https://www.mapbox.com/).
    *   **Google Maps:** Requires an API key from [Google Cloud Console](https://console.cloud.google.com/).
    *   **Leaflet with OpenStreetMap:** No API key needed for OpenStreetMap tiles, but be mindful of their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
3.  **Configure API Key in Frontend:**
    *   Store API keys securely. For client-side map libraries, these keys are often public but might be restricted (e.g., by domain).
    *   Use environment variables in your React app (e.g., `REACT_APP_MAPBOX_TOKEN`).
    ```bash
    # .env file for React app (root of /client directory)
    REACT_APP_MAPBOX_TOKEN=pk.your_mapbox_access_token
    REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSyYourGoogleMapsApiKey
    ```
4.  **Install SDK/Library:** Add the necessary npm packages to your React frontend.
5.  **Create Reusable Map Components:** Develop React components to encapsulate map rendering and interaction logic.
6.  **Backend Integration (Optional):** For geocoding, reverse geocoding, or storing/querying geospatial data (e.g., with PostGIS extension for PostgreSQL), backend integration will be needed.

## Integrating Specific Map Services (React Examples)

### 1. React-Leaflet (with OpenStreetMap)

`react-leaflet` provides React components for Leaflet maps.

**a. Installation & Setup:**
   ```bash
   # In your /client directory
   npm install leaflet react-leaflet
   ```
   Import Leaflet's CSS in your main React component (e.g., `client/src/App.js` or `client/src/index.js`):
   ```javascript
   // client/src/App.js or client/src/index.js
   import 'leaflet/dist/leaflet.css';
   ```

**b. Creating a Basic Leaflet Map Component (React):**
   ```jsx
   // client/src/components/maps/MyLeafletMap.jsx
   import React from 'react';
   import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

   const MyLeafletMap = ({ center = [51.505, -0.09], zoom = 13, markers = [] }) => {
     // It's important that the MapContainer has defined dimensions,
     // either via props, inline style, or CSS.
     return (
       <MapContainer center={center} zoom={zoom} style={{ height: '400px', width: '100%' }}>
         <TileLayer
           attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
         />
         {markers.map((marker, idx) => (
           <Marker key={idx} position={marker.position}>
             {marker.popupContent && <Popup>{marker.popupContent}</Popup>}
           </Marker>
         ))}
       </MapContainer>
     );
   };

   export default MyLeafletMap;

   // Usage in another component:
   // import MyLeafletMap from './MyLeafletMap';
   // const locations = [{ position: [51.505, -0.09], popupContent: "London!" }];
   // <MyLeafletMap markers={locations} />
   ```

### 2. Mapbox GL JS with React

You can use Mapbox GL JS directly or with React wrapper libraries like `react-map-gl`. Here's a direct usage example.

**a. Installation & Setup:**
   ```bash
   # In your /client directory
   npm install mapbox-gl
   # react-map-gl is also a popular choice: npm install react-map-gl mapbox-gl
   ```
   Import Mapbox GL JS CSS:
   ```javascript
   // client/src/App.js or client/src/index.js
   import 'mapbox-gl/dist/mapbox-gl.css';
   ```

**b. Configuring Access Token:**
   Set your Mapbox access token from the environment variable.
   ```javascript
   // client/src/components/maps/MyMapboxMap.jsx (or a central config file)
   import mapboxgl from 'mapbox-gl';
   // The worker is needed for performance and to avoid CSP issues if you have strict CSP.
   // You might need to configure your bundler (e.g. Webpack, Vite) to handle this.
   // One way is to copy mapbox-gl-csp-worker.js to your public folder.
   // mapboxgl.workerClass = require('mapbox-gl/dist/mapbox-gl-csp-worker').default; // If using CommonJS
   if (process.env.REACT_APP_MAPBOX_TOKEN) {
        mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;
   } else {
       console.error("Mapbox Access Token is not set. Please set REACT_APP_MAPBOX_TOKEN environment variable.");
   }
   ```

**c. Creating a Basic Mapbox GL JS Component (React):**
   ```jsx
   // client/src/components/maps/MyMapboxMap.jsx
   import React, { useRef, useEffect, useState } from 'react';
   import mapboxgl from 'mapbox-gl'; // Already configured with accessToken

   // Ensure mapboxgl.accessToken is set before this component renders
   // (e.g. in an import above or in App.js)

   const MyMapboxMap = ({
     initialLng = -74.5,
     initialLat = 40,
     initialZoom = 9,
     mapStyle = 'mapbox://styles/mapbox/streets-v12', // Default Mapbox style
     markersData = [] // [{ lng, lat, popupContent }]
   }) => {
     const mapContainerRef = useRef(null);
     const mapRef = useRef(null); // To store the map instance
     const [lng, setLng] = useState(initialLng);
     const [lat, setLat] = useState(initialLat);
     const [zoom, setZoom] = useState(initialZoom);

     useEffect(() => {
       if (mapRef.current || !mapContainerRef.current || !mapboxgl.accessToken) return; // Initialize map only once if container exists and token is set

       mapRef.current = new mapboxgl.Map({
         container: mapContainerRef.current,
         style: mapStyle,
         center: [lng, lat],
         zoom: zoom,
       });

       mapRef.current.on('move', () => {
         setLng(mapRef.current.getCenter().lng.toFixed(4));
         setLat(mapRef.current.getCenter().lat.toFixed(4));
         setZoom(mapRef.current.getZoom().toFixed(2));
       });

       // Add navigation control (zoom buttons, compass)
        mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

       // Clean up on unmount
       return () => mapRef.current.remove();
     }, [mapStyle]); // Only re-init if mapStyle changes (or on first load)

     // Effect for adding/updating markers
     useEffect(() => {
        if (!mapRef.current) return;

        // Clear existing markers (simple way, could be more performant by updating)
        // This requires keeping track of marker instances if you want to remove them individually.
        // For simplicity, we'll assume markers are re-added if markersData changes.

        markersData.forEach(markerData => {
            const marker = new mapboxgl.Marker()
                .setLngLat([markerData.lng, markerData.lat])
                .addTo(mapRef.current);
            if (markerData.popupContent) {
                const popup = new mapboxgl.Popup({ offset: 25 }).setText(markerData.popupContent);
                marker.setPopup(popup);
            }
        });
     }, [markersData, mapStyle]); // Re-run if markersData or mapStyle changes


     return (
       <div style={{ position: 'relative', height: '400px', width: '100%' }}>
         {!mapboxgl.accessToken && <div style={{color: 'red'}}>Mapbox token not configured.</div>}
         <div
            style={{position: 'absolute', top:0, left:0, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '5px', zIndex: 1, fontSize: '0.8em'}}
         >
           Lng: {lng} | Lat: {lat} | Zoom: {zoom}
         </div>
         <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
       </div>
     );
   };

   export default MyMapboxMap;

   // Usage:
   // import MyMapboxMap from './MyMapboxMap';
   // const mapMarkers = [{lng: -74.5, lat: 40, popupContent: "A location!"}];
   // <MyMapboxMap markersData={mapMarkers} />
   ```

### 3. Google Maps Platform (e.g., using `@vis.gl/react-google-maps`)

This library provides a set of React components for Google Maps.

**a. Installation & Setup:**
   ```bash
   # In your /client directory
   npm install @vis.gl/react-google-maps
   ```
**b. API Key Configuration & Loading:**
   You'll need to wrap your app or map components with `APIProvider` from the library.
   ```jsx
   // client/src/App.js or where you use the map
   import { APIProvider } from '@vis.gl/react-google-maps';

   // ...
   // <APIProvider apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}>
   //   <YourComponentWithMap />
   // </APIProvider>
   // ...
   ```
**c. Basic Google Map Component (React):**
   ```jsx
   // client/src/components/maps/MyGoogleMap.jsx
   import React from 'react';
   import { Map, AdvancedMarker, Pin, InfoWindow } from '@vis.gl/react-google-maps';

   const MyGoogleMap = ({ center = {lat: 34.397, lng: 150.644}, zoom = 8, markers = [] }) => {
     // markers: [{ position: {lat, lng}, title: "popup title" }]
     const [selectedMarker, setSelectedMarker] = React.useState(null);

     if (!process.env.REACT_APP_GOOGLE_MAPS_API_KEY) {
        return <div style={{color: 'red'}}>Google Maps API Key not configured.</div>;
     }

     return (
       <div style={{ height: '400px', width: '100%' }}>
         <Map defaultCenter={center} defaultZoom={zoom} mapId="my-platform-map"> {/* mapId is good for custom styling */}
           {markers.map((marker, idx) => (
             <AdvancedMarker
               key={idx}
               position={marker.position}
               onClick={() => setSelectedMarker(marker)}
             >
               <Pin /* Customize Pin appearance if needed */ />
             </AdvancedMarker>
           ))}
           {selectedMarker && (
             <InfoWindow
               position={selectedMarker.position}
               onCloseClick={() => setSelectedMarker(null)}
             >
               <p>{selectedMarker.title}</p>
             </InfoWindow>
           )}
         </Map>
       </div>
     );
   };
   export default MyGoogleMap;
   ```
   *Note: Ensure the `APIProvider` is higher up in the component tree.*

## Common Geolocation Features

### Displaying Markers & Popups
As shown in the examples, all libraries provide ways to add markers and display popups/info-windows. The data for markers (coordinates, popup content) would typically come from your platform's backend API or be user-defined.

### User Interaction
*   **Getting Click Coordinates:** Map libraries provide events to get coordinates when a user clicks on the map.
*   **Drawing Shapes:** For more advanced features like defining areas, look into drawing libraries/plugins compatible with your chosen map library (e.g., `Leaflet.pm`, `mapbox-gl-draw`, Google Maps Drawing Library).

### Geocoding and Reverse Geocoding (Backend Responsibility)
Converting addresses to coordinates (geocoding) or vice-versa (reverse geocoding) is best handled by your **Node.js backend** to protect API keys and manage usage/costs.
*   Your backend would call the chosen provider's Geocoding API (e.g., Mapbox Geocoding API, Google Geocoding API).
*   The frontend would make a request to your platform's backend API, which then proxies the request to the geocoding service.

**Conceptual Backend Geocoding Service (Node.js/Express):**
```javascript
// server/src/services/geocodingService.js (Conceptual)
// const axios = require('axios');
// const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN; // Server-side token

// async function geocodeWithMapbox(addressString) {
//   if (!MAPBOX_TOKEN) throw new Error('Mapbox token not configured on server.');
//   const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json?access_token=${MAPBOX_TOKEN}`;
//   try {
//     const response = await axios.get(url);
//     if (response.data && response.data.features && response.data.features.length > 0) {
//       const bestMatch = response.data.features[0];
//       return {
//         longitude: bestMatch.center[0],
//         latitude: bestMatch.center[1],
//         placeName: bestMatch.place_name,
//       };
//     }
//     return null;
//   } catch (error) {
//     console.error("Mapbox Geocoding Error:", error.message);
//     throw error;
//   }
// }
// module.exports = { geocodeWithMapbox };
```

### Storing and Querying Geospatial Data (PostgreSQL + PostGIS)
If your platform needs to store and query location data (e.g., "find all projects near a given point"):
*   **PostgreSQL with PostGIS:** The PostGIS extension for PostgreSQL provides powerful geospatial data types (e.g., `geometry`, `geography`) and functions for spatial queries.
*   **Prisma and PostGIS:** Prisma has support for PostGIS types and functions. You would define `Unsupported("geometry(Point, 4326)")` types in your `schema.prisma` and use raw queries (`$queryRaw`) for spatial operations.
    ```prisma
    // prisma/schema.prisma (example with PostGIS)
    // model LocationPoint {
    //   id          String    @id @default(cuid())
    //   name        String
    //   coordinates Unsupported("geometry(Point, 4326)") // SRID 4326 for WGS84
    //   // ... other fields
    //
    //   @@index([coordinates(ops: GistOps)]) // Spatial index
    // }
    ```
*   Your backend API would then expose endpoints for these spatial queries.

## Best Practices
*   **Secure API Keys:** For client-side maps, use public tokens/keys restricted by domain/referrer if possible. For server-side operations like geocoding, store full-access API keys securely on the backend and never expose them to the client.
*   **Asynchronous Loading:** Ensure map libraries and data are loaded asynchronously to avoid blocking UI rendering.
*   **Performance:**
    *   Use vector tiles (Mapbox, or Leaflet with vector tile plugins) for better performance.
    *   Implement marker clustering for large numbers of points (e.g., `react-leaflet-markercluster`).
*   **Cost Management:** Monitor API usage for commercial services. Implement client-side and server-side caching where appropriate.
*   **Modularity:** Use reusable React components for maps.

This guide provides a starting point for integrating maps into your React frontend. Adapt the examples to your specific needs and always refer to the official documentation of the chosen map libraries.
