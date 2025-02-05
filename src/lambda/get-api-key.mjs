import { APIGatewayClient, GetApiKeyCommand } from '@aws-sdk/client-api-gateway';

const apigateway = new APIGatewayClient({});

export const handler = async (event) => {
  const apiKeyId = event.apiKeyId;

  if (!apiKeyId) {
    console.error('API Key ID is required');
  }

  try {
    // Create a command to get the API key
    const command = new GetApiKeyCommand({
      apiKey: apiKeyId,
      includeValue: true
    });
    const data = await apigateway.send(command);

    return data.value

  } catch (error) {
    console.error('Error retrieving API key:', error);
  }
};