function handler(event) {
    var request = event.request;

    // Get the "Host" header value
    var hostHeader = request.headers['host'];

    // If the "Host" header exists, copy its value to the custom header "X-Viewer-Host"
    if (hostHeader) {
        request.headers['x-viewer-host'] = {
            value: hostHeader.value
        };
    }

    // Return the modified request
    return request;
}