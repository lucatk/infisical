import { Tag } from 'public/data/frequentInterfaces';

import getSecrets from '@app/pages/api/files/GetSecrets';
import getLatestFileKey from '@app/pages/api/workspace/getLatestFileKey';

import { decryptAssymmetric, decryptSymmetric } from '../cryptography/crypto';

interface EncryptedSecretProps {
  _id: string;
  createdAt: string;
  environment: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  type: 'personal' | 'shared';
  tags: Tag[];
}

interface SecretProps {
  key: string;
  value: string | undefined;
  type: 'personal' | 'shared';
  comment: string;
  id: string;
  tags: Tag[];
}

interface FunctionProps {
  env: string;
  setIsKeyAvailable?: any;
  setData?: any;
  workspaceId: string;
}

/**
 * Gets the secrets for a certain project
 * @param {object} obj
 * @param {string} obj.env - environment for which we are getting secrets
 * @param {boolean} obj.isKeyAvailable - if a person is able to create new key pairs
 * @param {function} obj.setData - state function that manages the state of secrets in the dashboard
 * @param {string} obj.workspaceId - id of a workspace for which we are getting secrets
 */
const getSecretsForProject = async ({
  env,
  setIsKeyAvailable,
  setData,
  workspaceId
}: FunctionProps) => {
  try {
    let encryptedSecrets;
    try {
      encryptedSecrets = await getSecrets(workspaceId, env);
    } catch (error) {
      console.log('ERROR: Not able to access the latest version of secrets');
    }

    const latestKey = await getLatestFileKey({ workspaceId });
    // This is called isKeyAvailable but what it really means is if a person is able to create new key pairs
    if (typeof setIsKeyAvailable === 'function') {
      setIsKeyAvailable(!latestKey ? encryptedSecrets.length === 0 : true);
    }

    const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;

    const tempDecryptedSecrets: SecretProps[] = [];
    if (latestKey) {
      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: latestKey.latestKey.encryptedKey,
        nonce: latestKey.latestKey.nonce,
        publicKey: latestKey.latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      // decrypt secret keys, values, and comments
      encryptedSecrets.forEach((secret: EncryptedSecretProps) => {
        const plainTextKey = decryptSymmetric({
          ciphertext: secret.secretKeyCiphertext,
          iv: secret.secretKeyIV,
          tag: secret.secretKeyTag,
          key
        });

        let plainTextValue;
        if (secret.secretValueCiphertext !== undefined) {
          plainTextValue = decryptSymmetric({
            ciphertext: secret.secretValueCiphertext,
            iv: secret.secretValueIV,
            tag: secret.secretValueTag,
            key
          });
        } else {
          plainTextValue = undefined;
        }

        let plainTextComment;
        if (secret.secretCommentCiphertext) {
          plainTextComment = decryptSymmetric({
            ciphertext: secret.secretCommentCiphertext,
            iv: secret.secretCommentIV,
            tag: secret.secretCommentTag,
            key
          });
        } else {
          plainTextComment = '';
        }

        tempDecryptedSecrets.push({
          id: secret._id,
          key: plainTextKey,
          value: plainTextValue,
          type: secret.type,
          comment: plainTextComment,
          tags: secret.tags
        });
      });
    }

    const secretKeys = [...new Set(tempDecryptedSecrets.map((secret) => secret.key))];

    const result = secretKeys.map((key, index) => ({
      id: tempDecryptedSecrets.filter((secret) => secret.key === key && secret.type === 'shared')[0]
        ?.id,
      idOverride: tempDecryptedSecrets.filter(
        (secret) => secret.key === key && secret.type === 'personal'
      )[0]?.id,
      pos: index,
      key,
      value: tempDecryptedSecrets.filter(
        (secret) => secret.key === key && secret.type === 'shared'
      )[0]?.value,
      valueOverride: tempDecryptedSecrets.filter(
        (secret) => secret.key === key && secret.type === 'personal'
      )[0]?.value,
      comment: tempDecryptedSecrets.filter(
        (secret) => secret.key === key && secret.type === 'shared'
      )[0]?.comment,
      tags: tempDecryptedSecrets.filter(
        (secret) => secret.key === key && secret.type === 'shared'
      )[0]?.tags
    }));

    if (typeof setData === 'function') {
      setData(result);
    }
  
    return result;
  } catch (error) {
    console.log('Something went wrong during accessing or decripting secrets.');
  }
  return [];
};

export default getSecretsForProject;
