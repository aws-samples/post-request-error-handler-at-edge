#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SayHiStack } from '../lib/say-hi-stack';

const app = new cdk.App();
new SayHiStack(app, 'SayHiStack', {
  env: { region: 'us-east-1' },
});