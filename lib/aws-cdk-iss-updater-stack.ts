import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface AwsCdkIssUpdaterStackProps extends cdk.StackProps {
  environment: string; // Example: 'dev', 'prod'
  applicationPool: string; // Name of the IIS application pool
  iisPath: string; // Path to the IIS root folder
  ec2InstanceId: string; // EC2 instance to target
  ec2RoleName: string; // Name of the EC2 instance role
  crossAccountAccountId: string; // AWS account ID to grant cross-account permissions
  artifactName: string; // Name of the artifact to deploy
}

export class AwsCdkIssUpdaterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsCdkIssUpdaterStackProps) {
    super(scope, id, props);

    const { 
      environment,
      applicationPool,
      iisPath,
      ec2InstanceId,
      ec2RoleName,
      crossAccountAccountId,
      artifactName,
    } = props;
    const artifactBucketName = `iis-updater-artifact-bucket-${environment}-${this.account}`;
    const ssmDocumentName = `HIAB-update-iss-server-${environment}`;
    
    
    var crossAccountRole = new iam.Role(this, "CrossAccountRole", {
      assumedBy: new iam.AccountPrincipal(crossAccountAccountId),
    });

    // 1. Create an S3 Bucket
    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      bucketName: artifactBucketName,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    var buildServerUserArn = cdk.Arn.format({
      service: "iam",
      resource: "user",
      resourceName: "BuildServer-CodeArtifact",
      region: "eu-central-1",
      account: "024295479209",
      partition: "aws",
    });


    // var buildServerUserArn = cdk.Arn.format({
    //   service: "iam",
    //   resource: "user",
    //   resourceName: "BuildServer-CodeArtifact",
    //   region: "eu-central-1",
    //   account: "024295479209",
    //   partition: "aws",
    // });


    // artifactBucket.addToResourcePolicy(new iam.PolicyStatement({
    //   actions: [
    //     "s3:MultipartUpload",
    //     "s3:PutObject",
    //     "s3:ListBucket",
    //     "s3:ListObjects",
    //     "s3:GetObject",
    //   ],
    //   resources: [artifactBucket.bucketArn, `${artifactBucket.bucketArn}/*`],
    //   principals: [new iam.ArnPrincipal(crossAccountRole.roleArn)],
    // }));


      // Grant crossAccountRole permissions to do multipart uploads to the artifact bucket
      // new iam.Policy(this, "ArtifactBucketPolicy", {
      //   roles: [crossAccountRole],
      //   statements: [
      //     new iam.PolicyStatement({
      //       actions: [  
      //         's3:ListMultipartUploadParts',
      //         's3:AbortMultipartUpload',
      //         's3:PutObject',
      //         's3:CreateMultipartUpload',
      //         's3:List*',
      //         's3:GetBucket*',
      //         's3:GetObject*',
      //       ],
      //       resources: [artifactBucket.bucketArn, `${artifactBucket.bucketArn}/*`],
      //     }),
      //   ],
      // });
  
        

    // Output the bucket name
    new cdk.CfnOutput(this, "ArtifactBucketName", {
      value: artifactBucket.bucketName,
      description: "Bucket to store deployment artifacts",
    });


    //2. Create the SSM Document

    const ssmScript = `
    $ErrorActionPreference = 'Stop'
    
    # Variables
    $bucketName = "${artifactBucket.bucketName}"
    $key = "${artifactName}"
    $localPath = "C:\\temp\\${artifactName}"
    $appPoolName = "${applicationPool}"
    $rootPath = "${iisPath}"
    
    try {
        Write-Host "Stopping IIS Application Pool: $appPoolName..."
        Stop-WebAppPool -Name $appPoolName -ErrorAction Stop
    
        Write-Host "Waiting for IIS Application Pool $appPoolName to stop..."
        while ((Get-WebAppPoolState -Name $appPoolName).Value -ne 'Stopped') {
            Write-Host "IIS Application Pool $appPoolName is still stopping..."; Start-Sleep -Seconds 2
        }
        Write-Host "IIS Application Pool $appPoolName stopped successfully."
    
        Write-Host 'Stopping IIS Server...'
        Stop-Service -Name 'W3SVC' -Force -ErrorAction Stop
    
        Write-Host 'Waiting for IIS Server to stop...'
        while ((Get-Service -Name 'W3SVC').Status -ne 'Stopped') {
            Write-Host 'IIS Server is still stopping...'; Start-Sleep -Seconds 2
        }
        Write-Host 'IIS Server stopped successfully.'
    
        Write-Host "Emptying IIS root folder: $rootPath..."
        if (Test-Path $rootPath) {
            Remove-Item -Recurse -Force -Path "$rootPath\\*"
        } else {
            Write-Host "Path $rootPath does not exist, skipping removal."
        }
    
        Write-Host 'Copying files from S3...'
        aws s3 cp "s3://$bucketName/$key" $localPath
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Failed to copy file from S3. Exiting...'
            exit 1
        }
    
        if (-Not (Test-Path $localPath)) {
            Write-Host 'File was not downloaded successfully. Exiting...'
            exit 1
        }
        Write-Host "File copied successfully from S3 to $localPath."
    
        Write-Host "Extracting files to IIS root folder: $rootPath..."
        Expand-Archive -Path $localPath -DestinationPath $rootPath -Force
    
        Write-Host "Removing temporary artifact: $localPath..."
        Remove-Item -Path $localPath -Force
    
        Write-Host 'Restarting IIS Server...'
        Start-Service -Name 'W3SVC' -ErrorAction Stop
    
        Write-Host 'Waiting for IIS Server to start...'
        while ((Get-Service -Name 'W3SVC').Status -ne 'Running') {
            Write-Host 'IIS Server is still starting...'; Start-Sleep -Seconds 2
        }
        Write-Host 'IIS Server started successfully.'
    
        Write-Host "Starting IIS Application Pool: $appPoolName..."
        Start-WebAppPool -Name $appPoolName -ErrorAction Stop
    
        Write-Host "Waiting for IIS Application Pool $appPoolName to start..."
        while ((Get-WebAppPoolState -Name $appPoolName).Value -ne 'Started') {
            Write-Host "IIS Application Pool $appPoolName is still starting..."; Start-Sleep -Seconds 2
        }
        Write-Host "IIS Application Pool $appPoolName started successfully."
    
        Write-Host 'Deployment completed successfully.'
    } catch {
        Write-Host "An error occurred: $_"
        Write-Host "Attempting to restart IIS Application Pool $appPoolName and IIS Server..."
    
        try {
            Write-Host "Starting IIS Application Pool: $appPoolName..."
            Start-WebAppPool -Name $appPoolName -ErrorAction Stop
            Write-Host "Waiting for IIS Application Pool $appPoolName to start..."
            while ((Get-WebAppPoolState -Name $appPoolName).Value -ne 'Started') {
                Write-Host "IIS Application Pool $appPoolName is still starting..."; Start-Sleep -Seconds 2
            }
            Write-Host "IIS Application Pool $appPoolName started successfully."
        } catch {
            Write-Host "Failed to restart IIS Application Pool: $_"
        }
    
        try {
            Write-Host 'Restarting IIS Server...'
            Start-Service -Name 'W3SVC' -ErrorAction Stop
            Write-Host 'Waiting for IIS Server to start...'
            while ((Get-Service -Name 'W3SVC').Status -ne 'Running') {
                Write-Host 'IIS Server is still starting...'; Start-Sleep -Seconds 2
            }
            Write-Host 'IIS Server started successfully.'
        } catch {
            Write-Host 'Failed to restart IIS Server: $_'
        }
    
        exit 1
    }`;


    const ssmDocument = new ssm.CfnDocument(this, 'IISDeploymentDocument', {
      name: ssmDocumentName,
      documentFormat: 'JSON',
      content: {
        schemaVersion: '2.2',
        description: 'Deploys application to IIS and restarts services.',
        mainSteps: [
          {
            action: 'aws:runPowerShellScript',
            name: 'IISDeployment',
            inputs: {
              timeoutSeconds: '600',
              runCommand: [ssmScript],
            },
          },
        ],
      },
      documentType: 'Command',
    });

    // Output the document name
    new cdk.CfnOutput(this, "SSMDocumentName", {
      value: ssmDocumentName,
      description: "SSM Document name for updating ISS",
    });


    //3. Grant S3 permissions to the EC2 instance

    var ec2InstanceRole = iam.Role.fromRoleName(this, "Ec2InstanceRole", ec2RoleName);

    artifactBucket.grantRead(ec2InstanceRole);
    

    // get bucket hiab-mcce-evo-function-p-logging and give ec2RoleName write access
    var loggingBucket = s3.Bucket.fromBucketName(this, "LoggingBucket", "hiab-mcce-evo-function-p-logging");
    loggingBucket.grantReadWrite(ec2InstanceRole);

    



    // 4. Grant cross-account role permissions to access the s3 bucket and ssm document


    

    crossAccountRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ssm:SendCommand"],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:document/${ssmDocumentName}`],
    }));

  }
}
