This is the backend for the Reusy app from HackTM 2022. It's an HTTP API built on AWS API Gateway backend by Lambda with DynamoDB for data storage.

The Lambda handler code is written in Typescript that is transpiled and bundled with all the dependencies into .js hanlder files using esbuild.

To deploy the stack:

- make sure you have installed AWS CLI and AWS CDK and they are set up with the account you want to use
- cd into the root of the repo and run `npm run deploy`
- when the deployment is finished, the CLI will output the API URL which you'll need to make requests

## Useful commands

- `npm run build` compile typescript to js using esbuild
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npm run deploy` builds the TS code and deploys the AWS Stack
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
