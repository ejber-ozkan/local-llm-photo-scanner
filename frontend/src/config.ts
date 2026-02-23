// Dynamically determine the backend API base URL based on the current window location
// This allows the UI to be accessed from other computers on the network
export const API_BASE_URL = `http://${window.location.hostname}:8000`;
