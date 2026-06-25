<template>
  <div class="show-qrcode">
    <h3 class="show-qrcode__title">Verify Your Identity</h3>
    <p class="show-qrcode__description">
      Scan the QR code to link an authenticator app to your wallet.
    </p>

    <input
      v-model="walletName"
      type="text"
      placeholder="Enter a name for this wallet."
      class="show-qrcode__input"
      :minlength="3"
      :maxlength="20"
      @keyup.enter="generateQrCode()"
    />

    <div class="show-qrcode__qr-image" v-if="qrCodeUrl !== ''">
      <img :src="qrCodeUrl" />
    </div>

    <p class="show-qrcode__label" v-if="qrCodeUrl !== ''">
      Enter the 6-digit code from your authenticator app.
    </p>

    <input
      v-model="otp"
      v-if="qrCodeUrl !== ''"
      type="text"
      placeholder="123456"
      class="show-qrcode__input"
      :maxlength="6"
      @keyup.enter="verifyOtp"
    />

    <base-button
      title="Verify OTP"
      :click="verifyOtp"
      :disabled="otp.length !== 6"
    />
  </div>
</template>

<script setup lang="ts">
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { onMounted, ref, computed, unref } from 'vue';
import BaseButton from '@action/components/base-button/index.vue';
import { useRouter } from 'vue-router';
import { routes } from '../restore-wallet/routes';
// import { useRestoreStore } from './store';
import { QRCodeService } from '@/libs/qrcode-service';
import { onboardInitializeWallets } from '@/libs/utils/initialize-wallet';
import { SecureQRCodeService } from '@/libs/secure-qrcode-service';

const router = useRouter();
//const store = useRestoreStore();
const otp = ref('');
const qrcodeService = new SecureQRCodeService();
const qrCodeUrl = ref<string>('');
const secretKey = ref<string>('');
const walletName = ref<string>('');
const isInitializing = ref(false);

const generateQrCode = async () => {
  secretKey.value = await qrcodeService.generateSecret();
  qrCodeUrl.value = await qrcodeService.generateQRCode(
    secretKey.value,
    walletName.value,
  );
};

// @TODO: fix this idk how but fix this
const verifyOtp = async () => {
  const isValid = await qrcodeService.verifyOtp(otp.value, secretKey.value);
  if (isValid) {
    alert('OTP Verified! Wallet initializing...');
    qrcodeService.saveQRCodeConfig(secretKey.value, walletName.value);
    console.log('QR code saved:', secretKey.value, walletName.value);
    // open wallet
    nextAction();
  } else {
    alert('Invalid OTP!');
  }
};

const nextAction = () => {
  isInitializing.value = true;
  router.push({ name: routes.walletReady.name });
};
</script>

<style lang="less">
@import '@/ui/action/styles/theme.less';

.show-qrcode {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  &__title {
    font-style: normal;
    font-weight: 700;
    font-size: 34px;
    line-height: 40px;
    color: @primaryLabel;
    margin-bottom: 8px;
  }

  &__description {
    font-size: 16px;
    color: @secondaryLabel;
    margin-bottom: 16px;
  }

  &__form {
    width: 100%;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }

  &__label {
    font-size: 14px;
    color: @secondaryLabel;
  }

  &__input {
    width: 80%;
    padding: 12px;
    font-size: 16px;
    border: 1px solid;
    border-radius: 8px;
    text-align: center;
  }

  &__qr-image {
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 16px;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  &__button {
    width: 50%;
    padding: 12px;
    font-size: 16px;
    font-weight: 600;
    color: white;
    background-color: #6200ea;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: 0.3s ease;

    &:disabled {
      background-color: white;
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      background-color: darken(#6200ea, 10%);
    }
  }

  &__hint {
    font-size: 14px;
    color: @secondaryLabel;
    margin-top: 10px;
  }
}
</style>
