<template>
  <div class="totp-validation__container">
    <div class="totp-validation__wrap">
      <p class="totp-validation__description">
        Enter the 6-digit code from your authenticator app.
      </p>

      <input
        v-model="otp"
        type="text"
        placeholder="123456"
        class="totp-validation__input"
        :maxlength="6"
        @keyup.enter="verifyOtp"
      />

      <base-button
        title="Verify OTP"
        :click="verifyOtp"
        :disabled="otp.length !== 6"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseButton from '@action/components/base-button/index.vue';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
// import { useRestoreStore } from '../store';
import { QRCodeService } from '@/libs/qrcode-service';
import { SecureQRCodeService } from '@/libs/secure-qrcode-service';
import { onboardInitializeWallets } from '@/libs/utils/initialize-wallet';

const router = useRouter();
const emit = defineEmits<{
  (e: 'update:init'): void;
}>();
//const store = useRestoreStore();
const otp = ref<string>('');
const qrcodeService = new SecureQRCodeService();
const secretKey = ref<string>('');
const walletName = ref<string>('');
const isInitializing = ref(false);

// @TODO: fix this idk how but fix this
const verifyOtp = async () => {
  console.log('verifyOtp called');
  console.log('otp:', otp.value);
  secretKey.value = await qrcodeService.getSecretKey();
  const isValid = await qrcodeService.verifyOtp(otp.value, secretKey.value);
  if (isValid) {
    alert('OTP Verified! Wallet initializing...');
    // qrcodeService.saveQRCodeConfig(secretKey.value, walletName.value);
    // console.log('QR code saved:', secretKey.value, walletName.value);
    // open wallet
    nextAction();
  } else {
    alert('Invalid OTP!');
  }
};

const nextAction = () => {
  // called by verifyOtp after verification success
  console.log('nextAction called');
  emit('update:init');
  // router.push({ name: 'home' });
};

onMounted(() => {
  console.log('totp-validation mounted');
});
</script>

<style lang="less" scoped>
@import '@action/styles/theme.less';
.totp-validation {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  &__container {
    height: 600px;
    width: 100%;
    overflow-x: hidden;
    overflow-y: hidden;
    position: fixed;
    left: 0;
    top: 0;
    z-index: 999;
    background: radial-gradient(
        100% 50% at 100% 50%,
        rgba(250, 250, 250, 0.92) 0%,
        rgba(250, 250, 250, 0.98) 100%
      )
      @primary;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
  }
  &__wrap {
    width: 320px;
    height: auto;
    box-sizing: border-box;
    position: relative;
    h4 {
      font-style: normal;
      font-weight: 700;
      font-size: 24px;
      line-height: 32px;
      color: @primaryLabel;
      margin: 0 0 8px 0;
    }
  }
  &__unlocking {
    width: 300px;
    height: 300px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    position: relative;

    svg {
      width: 132px;
      position: relative;
      z-index: 2;
    }
  }
  &__description {
    font-size: 16px;
    color: @secondaryLabel;
    margin-bottom: 16px;
  }
  &__input {
    width: 80%;
    padding: 12px;
    font-size: 16px;
    border: 1px solid;
    border-radius: 8px;
    text-align: center;
  }
  &__logo {
    margin-bottom: 24px;
  }
  &__forgot {
    position: absolute;
    width: 320px;
    left: 50%;
    margin-left: -160px;
    bottom: 20px;
  }
}
</style>
