#!/usr/bin/env bash

aws --endpoint-url=http://localhost:4572 s3 cp ../__tests__/resources/sample.txt s3://hocs-untrusted-bucket/
aws --endpoint-url=http://localhost:4572 s3 cp ../__tests__/resources/sample.rtf s3://hocs-untrusted-bucket/
aws --endpoint-url=http://localhost:4572 s3 cp ../__tests__/resources/sample.doc s3://hocs-untrusted-bucket/
aws --endpoint-url=http://localhost:4572 s3 cp ../__tests__/resources/sample.docx s3://hocs-untrusted-bucket/
aws --endpoint-url=http://localhost:4572 s3 cp ../__tests__/resources/sample.html s3://hocs-untrusted-bucket/
aws --endpoint-url=http://localhost:4572 s3 cp ../__tests__/resources/sample.test s3://hocs-untrusted-bucket/

sleep 2

aws --endpoint-url=http://localhost:4576 sqs send-message --queue-url http://localhost:4576/queue/hocs-documents-insecure \
 --message-body '{"caseUUID":"1234","documentDisplayName":"sample.txt","documentUUID":"txt.dummyId","s3UntrustedUrl":"sample.txt"}'

aws --endpoint-url=http://localhost:4576 sqs send-message --queue-url http://localhost:4576/queue/hocs-documents-insecure \
 --message-body '{"caseUUID":"1234","documentDisplayName":"sample.rtf","documentUUID":"rtf.dummyId","s3UntrustedUrl":"sample.rtf"}'

aws --endpoint-url=http://localhost:4576 sqs send-message --queue-url http://localhost:4576/queue/hocs-documents-insecure \
 --message-body '{"caseUUID":"1234","documentDisplayName":"sample.doc","documentUUID":"doc.dummyId","s3UntrustedUrl":"sample.doc"}'

aws --endpoint-url=http://localhost:4576 sqs send-message --queue-url http://localhost:4576/queue/hocs-documents-insecure \
 --message-body '{"caseUUID":"1234","documentDisplayName":"sample.docx","documentUUID":"docx.dummyId","s3UntrustedUrl":"sample.docx"}'

aws --endpoint-url=http://localhost:4576 sqs send-message --queue-url http://localhost:4576/queue/hocs-documents-insecure \
 --message-body '{"caseUUID":"1234","documentDisplayName":"sample.html","documentUUID":"html.dummyId","s3UntrustedUrl":"sample.html"}'

aws --endpoint-url=http://localhost:4576 sqs send-message --queue-url http://localhost:4576/queue/hocs-documents-insecure \
 --message-body '{"caseUUID":"1234","documentDisplayName":"sample.test","documentUUID":"test.dummyId","s3UntrustedUrl":"sample.test"}'
