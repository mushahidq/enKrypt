import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { NativeMessaging, NativeMessageResponse } from '../native-messaging';

export interface ISecureQRCodeService {
  secret: string;
  walletName: string;
  generateSecret(): Promise<string>;
  generateQRCode(secret: string, walletName?: string): Promise<string>;
  verifyOtp(otp: string, secret: string): Promise<boolean>;
  saveQRCodeConfig(secret: string, walletName: string): Promise<void>;
  getQRCodeConfig(): Promise<{ secret: string; walletName: string } | null>;
  migrateFromLegacy(): Promise<boolean>;
}

interface QRCodeConfig {
  secret: string;
  walletName: string;
}

export class SecureQRCodeService implements ISecureQRCodeService {
  private nativeMessaging: NativeMessaging;
  public secret: string = '';
  public walletName: string = '';

  constructor() {
    this.nativeMessaging = NativeMessaging.getInstance();
  }

  /**
   * Generates a new TOTP secret to be used for QR code generation
   * @returns {string} The generated secret
   */
  async generateSecret(): Promise<string> {
    return authenticator.generateSecret();
  }

  /**
   * Generates a QR code for the given TOTP secret
   * @param secret The TOTP secret
   * @param account The account name (user given)
   * @returns A promise that resolves to the QR code data URL
   */
  async generateQRCode(
    secret: string,
    walletName: string = 'enkrypt'
  ): Promise<string> {
    const otpAuth = authenticator.keyuri(walletName, 'enKrypt Wallet', secret);
    this.secret = secret;
    this.walletName = walletName;
    return QRCode.toDataURL(otpAuth);
  }

  /**
   * Verify a TOTP token
   * @param otp The TOTP token that needs to be verified
   * @param secret The TOTP secret
   * @returns {boolean} Whether the OTP is valid
   */
  async verifyOtp(otp: string, secret: string): Promise<boolean> {
    return authenticator.verify({ token: otp, secret });
  }

  /**
   * Save the QR code configuration using native messaging
   * This will trigger biometric authentication
   * @param secret The TOTP secret
   * @param walletName The wallet name
   */
  async saveQRCodeConfig(secret: string, walletName: string): Promise<void> {
    try {
      const response = await this.nativeMessaging.sendMessage<void>('saveSecret', {
        secret,
        walletName
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to save QR code configuration');
      }
    } catch (error) {
      console.error('Error saving QR code config:', error);
      throw error;
    }
  }

  /**
   * Get the QR code configuration using native messaging
   * This will trigger biometric authentication
   * @returns The QR code configuration or null if not found
   */
  async getQRCodeConfig(): Promise<QRCodeConfig | null> {
    try {
      const response = await this.nativeMessaging.sendMessage<QRCodeConfig>('getSecret');

      if (!response.success) {
        throw new Error(response.error || 'Failed to get QR code configuration');
      }

      if (!response.data) {
        return null;
      }

      // Update instance variables
      this.secret = response.data.secret;
      this.walletName = response.data.walletName;

      return response.data;
    } catch (error) {
      console.error('Error getting QR code config:', error);
      throw error;
    }
  }

  /**
   * Delete the stored QR code configuration
   * This will trigger biometric authentication
   */
  async deleteQRCodeConfig(): Promise<boolean> {
    try {
      const response = await this.nativeMessaging.sendMessage<void>('deleteSecret');

      if (!response.success) {
        throw new Error(response.error || 'Failed to delete QR code configuration');
      }

      // Clear instance variables
      this.secret = '';
      this.walletName = '';

      return true;
    } catch (error) {
      console.error('Error deleting QR code config:', error);
      throw error;
    }
  }

  /**
   * Migrate data from legacy QRCodeService
   * @param legacyService Instance of the legacy QRCodeService
   */
  async migrateFromLegacy(): Promise<boolean> {
    try {
      // Import the legacy service dynamically to avoid circular dependencies
      const { default: QRCodeService } = await import('../qrcode-service');
      const legacyService = new QRCodeService();
      
      const legacyConfig = await legacyService.getQRCodeConfig();
      if (!legacyConfig) {
        return false;
      }

      // Save to secure storage
      await this.saveQRCodeConfig(
        legacyConfig.secret,
        legacyConfig.walletName
      );

      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      return false;
    }
  }
}

export default SecureQRCodeService;
