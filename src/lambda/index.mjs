const RESPONSE_HEADERS = { 
    "Content-Type": "application/json", 
};

const buildCORSHeaders = (origin) => ({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "OPTIONS, POST",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Origin": origin,
});

export const handler = async (event) => {
    const httpMethod = event.httpMethod || "";
    const headers = event.headers || {};
    const isCors = headers["X-Is-Cors"]?.toLowerCase() === "true";
    const origin = headers["Origin"] || "";

    const corsHeaders = isCors ? buildCORSHeaders(origin) : {};

    try {
        // Simulate a 25% chance of returning a 502 error
        if (Math.random() < 0.25) {
            console.error("Random 502 error triggered.");
            return {
                statusCode: 502,
                headers: { ...RESPONSE_HEADERS, ...corsHeaders },
                body: JSON.stringify({ message: "Bad Gateway: Random failure." }),
            };
        }
        
        // Handle preflight OPTIONS request for CORS
        if (httpMethod === "OPTIONS" && isCors) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: "Preflight response" }),
            };
        }

        // Ensure the request is a POST request
        if (httpMethod !== "POST") {
            return {
                statusCode: 405,
                headers: { ...RESPONSE_HEADERS, ...corsHeaders },
                body: JSON.stringify({ error: "Method Not Allowed" }),
            };
        }

        // Parse and validate the request body
        let name;
        try {
            const body = JSON.parse(event.body || "{}");
            name = body.name?.trim();

            if (typeof name !== "string" || name.length === 0) {
                throw new Error("Invalid name provided");
            }
        } catch (error) {
            console.error("Invalid request body:", error);
            return {
                statusCode: 400,
                headers: { ...RESPONSE_HEADERS, ...corsHeaders },
                body: JSON.stringify({ error: "Invalid request body" }),
            };
        }

        // Create the response message
        const responseMessage = `Hi ${name}!`;
        const response = {
            statusCode: 200,
            headers: { ...RESPONSE_HEADERS, ...corsHeaders },
            body: JSON.stringify({ message: responseMessage }),
        };

        return response;
    } catch (error) {
        console.error("Unexpected error:", error);
        return {
            statusCode: 500,
            headers: { ...RESPONSE_HEADERS, ...corsHeaders },
            body: JSON.stringify({ message: "Internal Server Error." }),
        };
    }
};