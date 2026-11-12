# The crew centre's database: PocketBase 0.22 on Fly.io, its data on a volume.
# Deploy from this folder (see DEPLOYING.md). Stay on 0.22.x: the crew centre's
# database structure (installer/schema.json) is in 0.22's format.
FROM alpine:3.20

ARG PB_VERSION=0.22.22
RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
 && unzip /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip \
 && apk del unzip wget

EXPOSE 8080
# --automigrate=false: the structure comes from npm run setup (installer/schema.json),
# so PocketBase shouldn't write and replay its own migration files
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data", "--automigrate=false"]
