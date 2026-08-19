import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 콘솔에 등록된 appName. 영구 식별자이며 운영 도메인(https://sajuapp.web.tossmini.com)과
  // 딥링크(intoss://sajuapp)에 각인된다. 사용자에게 보이는 앱 이름은 콘솔의 별도 필드다.
  appName: 'sajuapp',
  brand: {
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
  },
  permissions: [],
  webBundleDir: 'dist',
});
