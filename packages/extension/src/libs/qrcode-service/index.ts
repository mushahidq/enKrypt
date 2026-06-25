import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import BrowserStorage from '../common/browser-storage';
import { InternalStorageNamespace } from '@/types/provider';

export interface IQRCodeService {
  secret: string;
  walletName: string;
  // enabled: boolean;
}

export class QRCodeService implements IQRCodeService {
  secret: string = '';
  walletName: string = '';
  private storage: BrowserStorage;
  private qrcodeKey = 'qrcode-key';

  constructor() {
    this.storage = new BrowserStorage(InternalStorageNamespace.qrcode);
  }

  /**
   * Generates a new TOTP secret to be used for QR code generation
   * @returns {string} The generated secret
   */
  async generateSecret(): Promise<string> {
    return authenticator.generateSecret();
  }

  async getSecretKey(): Promise<string> {
    const config = await this.getQRCodeConfig();
    return config?.secret || '';
  }

  /**
   * Generates a QR code for the given TOTP secret
   * @param secret The TOTP secret
   * @param account The account name (user given)
   *
   * @returns A promise that resolves to the QR code data URL
   */
  async generateQRCode(
    secret: string,
    walletName: string = 'enkrypt',
  ): Promise<string> {
    const otpAuth = authenticator.keyuri(walletName, 'enKrypt Wallet', secret);
    this.secret = secret;
    this.walletName = walletName;
    return QRCode.toDataURL(otpAuth);
  }

  /**
   * verify a TOTP token
   *
   * @param otp The TOTP token that needs to be verified
   * @param secret The TOTP secret
   *
   * @returns {boolean} Whether the OTP is valid
   */
  async verifyOtp(otp: string, secret: string): Promise<boolean> {
    return authenticator.verify({ token: otp, secret });
  }

  /**
   * Save the QR code configuration
   *
   * @param config The QR code configuration
   */
  async saveQRCodeConfig(secret: string, walletName: string): Promise<void> {
    await this.storage.set(this.qrcodeKey, { secret, walletName });
    // ^^ json object
  }

  /**
   * Get the QR code configuration
   *
   * @returns The QR code configuration
   */
  async getQRCodeConfig(): Promise<QRCodeService | null> {
    return this.storage.get(this.qrcodeKey);
  }
}

export default QRCodeService;
