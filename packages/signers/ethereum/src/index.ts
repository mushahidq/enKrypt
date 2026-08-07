import {
  privateToPublic,
  ecsign,
  ecrecover,
  fromRpcSig,
  toRpcSig,
  privateToAddress,
} from "@ethereumjs/util";
import { mnemonicToSeed } from "bip39";
import {
  Errors,
  SignerInterface,
  KeyPair,
  MnemonicWithExtraWord,
  SocketClientOptions,
} from "@enkryptcom/types";
import {
  hexToBuffer,
  bufferToHex,
  encryptedDataStringToJson,
  naclDecodeHex,
  naclDecrypt,
  WebSocketClient,
} from "@enkryptcom/utils";
import HDkey from "hdkey";
import { box as naclBox } from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import {
  P1Signature,
  IP1KeyShare,
} from "@silencelaboratories/ecdsa-tss";

export class EthereumSigner implements SignerInterface {
  async generate(
    mnemonic: MnemonicWithExtraWord,
    derivationPath = "",
  ): Promise<KeyPair> {
    const seed = await mnemonicToSeed(mnemonic.mnemonic, mnemonic.extraWord);
    const hdkey = HDkey.fromMasterSeed(seed);
    const key = hdkey.derive(derivationPath);
    return {
      address: bufferToHex(privateToAddress(key.privateKey)),
      privateKey: bufferToHex(key.privateKey),
      publicKey: bufferToHex(privateToPublic(key.privateKey)),
    };
  }

  async verify(
    msgHash: string,
    sig: string,
    publicKey: string,
  ): Promise<boolean> {
    const sigdecoded = fromRpcSig(sig as `0x${string}`);
    const rpubkey = ecrecover(
      hexToBuffer(msgHash),
      sigdecoded.v,
      sigdecoded.r,
      sigdecoded.s,
    );
    return bufferToHex(rpubkey) === publicKey;
  }

  async sign(msgHash: string, keyPair: KeyPair): Promise<string> {
    const msgHashBuffer = hexToBuffer(msgHash);
    const privateKeyBuffer = hexToBuffer(keyPair.privateKey);
    const signature = ecsign(msgHashBuffer, privateKeyBuffer);
    const rpcSig = toRpcSig(signature.v, signature.r, signature.s);
    if (!this.verify(bufferToHex(msgHashBuffer), rpcSig, keyPair.publicKey)) {
      throw new Error(Errors.SigningErrors.UnableToVerify);
    }
    return toRpcSig(signature.v, signature.r, signature.s);
  }

  async thresholdSign(
    msgHash: string,
    socketClientOptions: SocketClientOptions,
    sessionId: string,
    p1KeyShare: IP1KeyShare,
  ): Promise<string> {
    const msgHashBuffer = hexToBuffer(msgHash);
    const msgHashUint8Array  = new Uint8Array(msgHashBuffer);

    const socketClient = new WebSocketClient(socketClientOptions);
    try {
      await socketClient.connect();
      const p1 = new P1Signature(sessionId, msgHashUint8Array , p1KeyShare);

      const msg1 = await p1.processMessage(null);
      const reply1 = await socketClient.sendMessage({
        sessionId,
        round: 1,
        phase: "sign_round_1",
        payload: {
          msg_to_send: msg1.msg_to_send,
          msgHashUint8Array : msgHashUint8Array 
        }
      });

      const msg3 = await p1.processMessage(reply1.payload as string);
      const reply2 = await socketClient.sendMessage({
        sessionId,
        round: 2,
        phase: "sign_round_2",
        payload: msg3.msg_to_send,
      });
      
      const msg5 = await p1.processMessage(reply2.payload as string);
      if (!msg5.signature) {
        throw new Error("Signing did not complete on P1's side");
      }
      
      return msg5.signature;
    }
    finally {
      socketClient.close();
    }
    // const rpcSig = toRpcSig(signature.v, signature.r, signature.s);
    // if (!this.verify(bufferToHex(msgHashBuffer), rpcSig, keyPair.publicKey)) {
    //   throw new Error(Errors.SigningErrors.UnableToVerify);
    // }
    // return toRpcSig(signature.v, signature.r, signature.s);
  }

  async getEncryptionPublicKey(keyPair: KeyPair): Promise<string> {
    const privateKeyUint8Array = naclDecodeHex(keyPair.privateKey);
    const encryptionPublicKey =
      naclBox.keyPair.fromSecretKey(privateKeyUint8Array).publicKey;
    return encodeBase64(encryptionPublicKey);
  }

  async decrypt(encryptedDataStr: string, keyPair: KeyPair): Promise<string> {
    const encryptedData = encryptedDataStringToJson(encryptedDataStr);
    return naclDecrypt({ encryptedData, privateKey: keyPair.privateKey });
  }
}
