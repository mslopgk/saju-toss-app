import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import './index.css'
// 모션 규칙을 진입점에서 한 번만 싣는다. 화면마다 import 하면 순서가 갈려 규칙이 어긋난다.
import './shared/motion/motion.css'
import App from './App.tsx'

// TDSMobileAITProvider 는 GlobalCSSVariables 와 SafeAreaInsets 를 내부에서 렌더한다.
// 따라서 둘을 별도로 감싸면 중복이다.
// brandPrimaryColor 는 넘기지 않는다 → TDS 기본색(blue500)을 사용한다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TDSMobileAITProvider>
      <App />
    </TDSMobileAITProvider>
  </StrictMode>,
)
