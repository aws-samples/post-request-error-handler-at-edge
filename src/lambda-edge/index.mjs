/**
 * Lambda@Edge function to handle 502 errors with redirection for POST/OPTIONS requests.
 * Adds retry logic with cookies and CORS handling for cross-origin scenarios.
 */

export const handler = async (event) => {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  // Helper function to parse cookies from the request headers
  const parseCookies = (cookieHeader) => {
      if (!cookieHeader) return {};
      return cookieHeader[0].value.split(";").reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split("=");
          acc[key] = value;
          return acc;
      }, {});
  };

  // Helper function to build CORS headers
  const buildCORSHeaders = (origin) => {
      if (!origin) {
          console.warn("No valid origin found. CORS headers might fail.");
          return {};
      }
      return {
          "access-control-allow-credentials": [{ key: "Access-Control-Allow-Credentials", value: "true" }],
          "access-control-allow-origin": [{ key: "Access-Control-Allow-Origin", value: origin }],
          "access-control-allow-methods": [{ key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" }],
          "access-control-allow-headers": [{ key: "Access-Control-Allow-Headers", value: "Content-Type" }],
      };
  };

  // Helper function to build a redirect response
  const buildRedirectResponse = (location, newCount, isCors, origin) => {
      const cookieAttributes = isCors
          ? "SameSite=None; Secure; HttpOnly; Max-Age=60"
          : "HttpOnly; Max-Age=60"; // Omit 'Secure' for same-origin requests
      
      const corsHeaders = isCors ? buildCORSHeaders(origin) : {};

      return {
          status: "307",
          statusDescription: "Temporary Redirect",
          headers: {
              location: [{ key: "Location", value: location }],
              "cache-control": [{ key: "Cache-Control", value: "no-cache" }],
              "set-cookie": [
                  {
                      key: "Set-Cookie",
                      value: `RedirectCount=${newCount}; ${cookieAttributes}`, // Adjusted attributes
                  },
              ],
              ...corsHeaders,
          },
      };
  };

  // Parse necessary headers
  const isCors = headers["x-is-cors"]?.[0]?.value.toLowerCase() === "true";
  const origin = headers.origin?.[0]?.value || null;
  const cookies = parseCookies(headers.cookie);

  // Extract and increment the redirect count
  const currentCount = parseInt(cookies.RedirectCount || "0", 10);
  const newCount = currentCount + 1;

  // If the redirect limit is reached, return the original response
  if (currentCount >= 3) {
      console.log("Redirect limit reached. Returning original 502 response.");
      return response;
  }

  // Handle 502 error responses
  if (response.status === "502") {
      console.log(`502 error detected. Redirect count: ${currentCount}`);

      // Handle cross-origin requests
      if (isCors) {
          const host = headers["x-viewer-host"]?.[0]?.value;
          if (!host) {
              console.error("Missing 'x-viewer-host' header for cross-origin request.");
              return response;
          }

          const location = `https://${host}${request.uri}`;

          if (request.method === "OPTIONS") {
              console.log("Handling OPTIONS request with CORS headers.");
              return {
                  status: "200",
                  statusDescription: "OK",
                  headers: buildCORSHeaders(origin),
              };
          } else if (request.method === "POST") {
              console.log("Redirecting cross-origin POST request.");
              return buildRedirectResponse(location, newCount, true, origin); // Include 'Secure' for CORS
          }
      } else if (request.method === "POST") {
          console.log("Redirecting same-origin POST request.");
          return buildRedirectResponse(request.uri, newCount, false, origin); // Exclude 'Secure' for same-origin
      }
  }

  // If not a 502 error or unsupported method, return the original response
  console.log("Returning original response.");
  return response;
};