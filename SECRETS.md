# Reading Kubernetes Secrets in Your Node.js App

This guide explains how your Node.js application now reads secrets from mounted Kubernetes volumes.

## How It Works

Your application has three ways to get configuration values, checked in this order:

1. **Environment Variables** (for development/Docker)
   ```bash
   MYSQL_HOST=localhost node server.mjs
   ```

2. **Mounted Secret Files** (for Kubernetes)
   - Secrets mounted at `/etc/secrets/` by default
   - File names: `mysql-host`, `mysql-user`, `mysql-password`, etc.

3. **Default Values** (fallback)
   - Some values have sensible defaults

## Setup for Kubernetes

### Step 1: Create the Secret

```bash
kubectl create secret generic mysql-secrets \
  --from-literal=mysql-host=mysql.default.svc.cluster.local \
  --from-literal=mysql-user=appuser \
  --from-literal=mysql-password=supersecretpassword \
  --from-literal=mysql-database=appdb
```

Or use the manifest file:
```bash
kubectl apply -f k8s-example.yml
```

### Step 2: Deploy with Volume Mount

The `k8s-example.yml` shows a complete deployment that:
- Creates a Kubernetes Secret
- Mounts it to `/etc/secrets` in the container
- Sets `SECRETS_MOUNT_PATH=/etc/secrets` environment variable

### Step 3: Your App Reads the Secrets

No code changes needed! The app automatically:
- Reads the secrets from mounted files
- Validates required values exist
- Throws helpful error messages if anything is missing

## Environment Variables Mapping

| Config Value | Env Variable | Secret File |
|---|---|---|
| MySQL Host | `MYSQL_HOST` | `mysql-host` |
| MySQL Port | `MYSQL_PORT` | `mysql-port` |
| MySQL User | `MYSQL_USER` | `mysql-user` |
| MySQL Password | `MYSQL_PASSWORD` | `mysql-password` |
| MySQL Database | `MYSQL_DATABASE` | `mysql-database` |
| MySQL Table | `MYSQL_EXAMPLE_TABLE` | `mysql-table` |
| Connection Limit | `MYSQL_CONNECTION_LIMIT` | `mysql-connection-limit` |

## Local Development (Docker)

For Docker without Kubernetes, use env vars:

```bash
docker run -e MYSQL_HOST=db \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=secret \
  -e MYSQL_DATABASE=appdb \
  your-image:latest
```

Or mount a local secret directory:
```bash
mkdir -p /tmp/secrets
echo "sensitive-password" > /tmp/secrets/mysql-password
# ... create other secret files ...

docker run -v /tmp/secrets:/etc/secrets \
  -e SECRETS_MOUNT_PATH=/etc/secrets \
  your-image:latest
```

## Security Best Practices

✅ **What the code does:**
- Reads secrets from secure file mounts (vs env vars in `ps` output)
- Trims whitespace from secret files
- Validates required secrets exist at startup
- Uses sensible defaults for non-critical values

✅ **What Kubernetes does:**
- Secret files are mounted read-only (`defaultMode: 0400`)
- Secrets are stored encrypted in etcd (if configured)
- Secrets are NOT visible in pod descriptions or logs

## Custom Secrets Path

To use a different mount path:

```bash
# In Kubernetes, set the environment variable:
- name: SECRETS_MOUNT_PATH
  value: /var/run/secrets/mysql

# Your app will look for secrets there instead
```

## Adding New Secrets

To add a new secret (e.g., API key):

1. **Update `secrets.mjs`** with individual functions if needed
2. **Update `db.mjs`** or other config files:
   ```javascript
   apiKey: getSecret('API_KEY', 'api-key', null)
   ```
3. **Update Kubernetes manifests** to include the new secret
4. **Restart pods** to pick up new secrets

## Troubleshooting

### "Secret not found: MYSQL_PASSWORD"
- Check the secret file exists: `kubectl exec pod-name -- ls -la /etc/secrets/`
- Check file permissions: `kubectl exec pod-name -- cat /etc/secrets/mysql-password`

### Wrong secret values
- Verify the secret content: `kubectl get secret mysql-secrets -o json | jq '.data'`
- Note: Values are base64-encoded in output, but files aren't

### Using env vars instead of files
- Explicitly set env vars in your Pod spec
- Set `SECRETS_MOUNT_PATH` to empty/nonexistent path to disable file reading

## Advanced: Rotating Secrets

Kubernetes will automatically update mounted secret files when you update the Secret resource:

```bash
kubectl patch secret mysql-secrets -p '{"data":{"mysql-password":"'$(echo -n newpassword | base64)'"}}'
```

The files in `/etc/secrets/` will be updated within a few seconds (depending on sync frequency).

For zero-downtime rotation:
1. Update the secret
2. Kubernetes updates the mounted files
3. App reads fresh values on next connection attempt
4. No pod restart needed (if handled gracefully in your code)
