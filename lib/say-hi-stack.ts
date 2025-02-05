import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Names } from 'aws-cdk-lib';


export class SayHiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an S3 bucket with all public access blocked
    const websiteBucket = new s3.Bucket(this, 'SayHiBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Create a regional Lambda function as the back-end application
    const sayHiLambda = new lambda.Function(this, 'SayHiApp', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('./src/lambda'),
      architecture: lambda.Architecture.ARM_64,
    });

    // Create a regional Lambda function to retrieve API key value
    const getApiKeyValueFunction = new lambda.Function(this, 'getApiKeyValueFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'get-api-key.handler',
      code: lambda.Code.fromAsset('./src/lambda'),
      architecture: lambda.Architecture.ARM_64,
    });

    // Create the CloudFront Function with Development Runtime set to cloudfront-js-2.0
    const cloudFrontFunction = new cloudfront.Function(this, 'CopyHostHeaderToOrigin', {
      functionName: Names.uniqueId(this) + 'CopyHostHeader',
      code: cloudfront.FunctionCode.fromFile({
        filePath: path.join(__dirname, '../src/cloudfront-functions/copy-host-header.js'),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    cloudFrontFunction.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Create the Lambda@Edge function
    const lambdaEdgeFunction = new lambda.Function(this, 'LambdaEdgeFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('./src/lambda-edge'),
      architecture: lambda.Architecture.X86_64,
    });

    const lambdaEdgeVersion = lambdaEdgeFunction.currentVersion;

    // Grant CloudFront permission to invoke the Lambda function
    lambdaEdgeFunction.grantInvoke(new iam.ServicePrincipal('edgelambda.amazonaws.com'));
    lambdaEdgeFunction.grantInvoke(new iam.ServicePrincipal('lambda.amazonaws.com'));

    // Add permissions to read API keys
    getApiKeyValueFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['apigateway:GET'],
        resources: ['arn:aws:apigateway:*::/apikeys/*'],
      })
    );

    // Create an API Gateway with CORS preflight disabled
    const api = new apigateway.RestApi(this, 'SayHiApi', {
      restApiName: 'SayHiApi',
      description: 'API for SayHiApp',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    // Create a resource for the API path
    const apiResource = api.root.addResource('api');

    // Add POST method integration with Lambda
    new apigateway.Method(this, 'PostMethod', {
      httpMethod: 'POST',
      resource: apiResource,
      integration: new apigateway.LambdaIntegration(sayHiLambda),
      options: {
        apiKeyRequired: true,
      },
    });

    // Add OPTIONS method integration with Lambda for 502 error simulation
    new apigateway.Method(this, 'OptionsMethod', {
      httpMethod: 'OPTIONS',
      resource: apiResource,
      integration: new apigateway.LambdaIntegration(sayHiLambda),
      options: {
        apiKeyRequired: true,
      },
    });

    // Create an API key
    const apiKey = api.addApiKey('SayHiApiKey', {
      apiKeyName: 'SayHiApiKey',
    });

    // Create a usage plan and associate with the API key
    const usagePlan = api.addUsagePlan('SayHiUsagePlan', {
      name: 'SayHiUsagePlan',
      throttle: {
        rateLimit: 10,
        burstLimit: 2,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: api.deploymentStage,
    });

    // Retrieve the API key value of apiKeyId
    const getApiKeyValue = new cr.AwsCustomResource(this, 'GetApiKeyValue', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: getApiKeyValueFunction.functionArn,
          Payload: JSON.stringify({ apiKeyId: apiKey.keyId }),
        },
        physicalResourceId: cr.PhysicalResourceId.of(apiKey.keyId), // Use stable unique ID for the resource to avoid unnecessary invocation
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [getApiKeyValueFunction.functionArn],
        }),
      ]),
    });

    const apiKeyValueData = getApiKeyValue.getResponseField('Payload');   // Extra quotes will be added to the Token

    // Retrieve apiKeyValue without extra quotas
    const splitApiKeyValueData = cdk.Fn.split('"', apiKeyValueData);
    const apiKeyValue = cdk.Fn.select(1, splitApiKeyValueData);

    // Create a CloudFront distribution for the back-end for CORS scenario
    const backendDistribution = new cloudfront.Distribution(this, 'SayHiApiBackendDistribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${api.restApiId}.execute-api.${this.region}.amazonaws.com`, {
          originPath: '/prod',
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          customHeaders: {
            'X-API-Key': apiKeyValue,
            'X-Is-Cors': 'true',
          },
          keepaliveTimeout: cdk.Duration.seconds(60),
        }),
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        functionAssociations: [{
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          function: cloudFrontFunction,
        }],
        edgeLambdas: [{
          functionVersion: lambdaEdgeVersion,
          eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
        }],
      },
      comment: 'Say Hi App back-end API for CORS scenario',
    });

    // Create a CloudFront distribution for the frontend
    const frontendDistribution = new cloudfront.Distribution(this, 'frontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      comment: 'Say Hi App front-end website and API for single domain scenario',
    });

    // Add a behavior for the API
    frontendDistribution.addBehavior('/api', new origins.HttpOrigin(`${api.restApiId}.execute-api.${this.region}.amazonaws.com`, {
      originPath: '/prod',
      customHeaders: {
        'X-API-Key': apiKeyValue,
        'X-Is-Cors': 'false',
      },
      keepaliveTimeout: cdk.Duration.seconds(60),
    }),{
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      edgeLambdas: [{
        functionVersion: lambdaEdgeVersion,
        eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
      }],
    });

    const backendApiUrl = `https://${backendDistribution.distributionDomainName}/api`;
    const frontendApiUrl = `https://${frontendDistribution.distributionDomainName}/api`;

    // Generate the config.json file dynamically
    const configContent = JSON.stringify({
      REACT_APP_FRONTEND_URL: frontendApiUrl,
      REACT_APP_BACKEND_URL: backendApiUrl,
    });

    // Deploy the React SPA to the bucket
    new s3Deployment.BucketDeployment(this, 'DeployReactApp', {
      sources: [
        s3Deployment.Source.asset('./static/build'),
        s3Deployment.Source.data('config.json', configContent), // Dynamic config.json
      ],
      destinationBucket: websiteBucket,
    });

    //Output the Say-Hi website URL
    new cdk.CfnOutput(this, 'SayHiWebsiteURL', {
      value: `https://${frontendDistribution.distributionDomainName}`,
    })
  }
}
