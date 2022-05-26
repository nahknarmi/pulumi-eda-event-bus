import * as aws from "@pulumi/aws";
import {BucketAclV2, BucketV2} from "@pulumi/aws/s3";
import {SecurityGroup, Subnet, Vpc} from "@pulumi/aws/ec2";
import {Key} from "@pulumi/aws/kms";
import {LogGroup} from "@pulumi/aws/cloudwatch";
import {FirehoseDeliveryStream} from "@pulumi/aws/kinesis";
import {Cluster} from "@pulumi/aws/msk";


// Create an AWS resource (S3 Bucket)
const fileLandingZone = new aws.s3.Bucket("file-landing-zone", {});

// Export the name of the bucket
export const bucketName = fileLandingZone.id;

// When a new thumbnail is created, log a message.
fileLandingZone.onObjectCreated("onNewDepositoryFile", new aws.lambda.CallbackFunction<aws.s3.BucketEvent, void>("onNewDepositoryFile", {
    callback: async bucketArgs => {
        console.log("onNewDepositoryFile called");
        if (!bucketArgs.Records) {
            return;
        }

        for (const record of bucketArgs.Records) {
            console.log(`*** New Depository: file ${record.s3.object.key} was saved at ${record.eventTime}.`);
        }
    },
    policies: [
        aws.iam.ManagedPolicy.AWSLambdaExecute,                 // Provides wide access to Lambda and S3
    ],
}), {filterSuffix: ".csv"});


let vpc = new Vpc("vpc", {cidrBlock: "192.168.0.0/22"});
let availabilityZones = aws.getAvailabilityZones({state: "available"});


let subnetAz1 = new Subnet("subnetAz1", {
    availabilityZone: availabilityZones.then(azs => azs.names[0]),
    cidrBlock: "192.168.0.0/24",
    vpcId: vpc.id
});

let subnetAz2 = new Subnet("subnetAz2", {
    availabilityZone: availabilityZones.then(azs => azs.names[1]),
    cidrBlock: "192.168.1.0/24",
    vpcId: vpc.id
});

let subnetAz3 = new Subnet("subnetAz3", {
    availabilityZone: availabilityZones.then(azs => azs.names[3]),
    cidrBlock: "192.168.2.0/24",
    vpcId: vpc.id
});

let securityGroup = new SecurityGroup("msk", {vpcId: vpc.id});
let key = new Key("msk-key", {description: "example"});
let logGroup = new LogGroup("test");
let bucket = new BucketV2("bucket", {});
let bucketAcl = new BucketAclV2("bucketAcl", {
    bucket: bucket.id,
    acl: "private"
});
const firehoseRole = new aws.iam.Role("firehoseRole", {
    assumeRolePolicy: `{
"Version": "2012-10-17",
"Statement": [
  {
    "Action": "sts:AssumeRole",
    "Principal": {
      "Service": "firehose.amazonaws.com"
    },
    "Effect": "Allow",
    "Sid": ""
  }
  ]
}
`
});
let testStream = new FirehoseDeliveryStream("testStream", {
    destination: "s3",
    s3Configuration: {
        roleArn: firehoseRole.arn,
        bucketArn: bucket.arn
    },
    tags: {
        LogDeliveryEnabled: "placeholder"
    }
});

let cluster = new Cluster("example", {
    kafkaVersion: "2.8.1",
    numberOfBrokerNodes: 1,
    brokerNodeGroupInfo: {
        instanceType: "kafka.t3.small",
        ebsVolumeSize: 30,
        clientSubnets: [
            subnetAz1.id,
            subnetAz2.id,
            subnetAz3.id
        ],
        securityGroups: [securityGroup.id],
    },
    encryptionInfo: {
        encryptionAtRestKmsKeyArn: key.arn
    },
    openMonitoring: {
        prometheus: {
            jmxExporter: {
                enabledInBroker: true,
            },
            nodeExporter: {
                enabledInBroker: true
            }
        }
    },
    loggingInfo: {
        brokerLogs: {
            cloudwatchLogs: {
                enabled: true,
                logGroup: logGroup.name
            },
            firehose: {
                enabled: true,
                deliveryStream: testStream.name
            },
            s3: {
                enabled: true,
                bucket: bucket.id,
                prefix: "logs/msk-"
            }
        },
    },
    tags: {
        foo: "bar"
    }
});

export const zookeeperConnectString = cluster.zookeeperConnectString;
export const bootstrapBrokersTls = cluster.bootstrapBrokersTls;


