import fs from 'fs';
import path from 'path';

/**
 * Reads a secret value from either environment variable or mounted file
 * Priority: env var > secret file > default value
 * 
 * @param {string} envName - Environment variable name
 * @param {string} secretPath - Path to secret file (relative to SECRETS_MOUNT_PATH)
 * @param {string} defaultValue - Default value if neither env var nor file exists
 * @returns {string} The secret value
 */
export function getSecret(envName, secretPath, defaultValue = null) {
  // First, try environment variable
  if (process.env[envName]) {
    return process.env[envName];
  }

  // Second, try reading from mounted secret file
  const secretsMountPath = process.env.SECRETS_MOUNT_PATH || '/etc/secrets';
  const fullSecretPath = path.join(secretsMountPath, secretPath);

  try {
    if (fs.existsSync(fullSecretPath)) {
      const value = fs.readFileSync(fullSecretPath, 'utf8').trim();
      if (value) {
        return value;
      }
    }
  } catch (error) {
    console.warn(`Failed to read secret from ${fullSecretPath}:`, error.message);
  }

  // Finally, use default value
  if (defaultValue !== null) {
    return defaultValue;
  }

  // If nothing found and no default, throw error
  throw new Error(
    `Secret not found: ${envName} (env var) or ${fullSecretPath} (file), and no default provided`
  );
}

/**
 * Reads a secret value that is required (must exist)
 * 
 * @param {string} envName - Environment variable name
 * @param {string} secretPath - Path to secret file (relative to SECRETS_MOUNT_PATH)
 * @returns {string} The secret value
 */
export function requireSecret(envName, secretPath) {
  return getSecret(envName, secretPath, null);
}
