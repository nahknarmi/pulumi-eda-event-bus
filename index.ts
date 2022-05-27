import * as aws from "@pulumi/aws";
import {BucketAclV2, BucketV2} from "@pulumi/aws/s3";
import {SecurityGroup} from "@pulumi/aws/ec2";
import {Key} from "@pulumi/aws/kms";
import {LogGroup} from "@pulumi/aws/cloudwatch";
import {FirehoseDeliveryStream} from "@pulumi/aws/kinesis";
import {Cluster} from "@pulumi/aws/msk";
import * as pulumi from "@pulumi/pulumi";


const config = new pulumi.Config();
const stack = pulumi.getStack();
const org = config.require("org");

const baseStackRef = new pulumi.StackReference(`nahknarmi/pulumi-eda-base`)

let securityGroup = new SecurityGroup("msk", {vpcId: baseStackRef.getOutput("vpcId")});
let key = new Key("msk-key", {description: "example"});
let logGroup = new LogGroup("test");
let mskLogsBucket = new BucketV2("mskLogBucket", {});
let bucketAcl = new BucketAclV2("bucketAcl", {
    bucket: mskLogsBucket.id,
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
        bucketArn: mskLogsBucket.arn
    },
    tags: {
        LogDeliveryEnabled: "placeholder"
    }
});

let cluster = new Cluster("my-kafka", {
    kafkaVersion: "2.8.1",
    numberOfBrokerNodes: 2,
    brokerNodeGroupInfo: {
        instanceType: "kafka.t3.small",
        ebsVolumeSize: 30,
        clientSubnets: [
            baseStackRef.getOutput("subnetAz1Id"),
            baseStackRef.getOutput("subnetAz2Id"),
            // baseStackRef.getOutput("subnetAz3Id")
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
                bucket: mskLogsBucket.id,
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
