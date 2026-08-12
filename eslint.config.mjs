import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python 가상환경. torch 가 딸려 보내는 .mjs 까지 검사 대상에 잡혀
    // 우리 코드와 무관한 경고가 나온다.
    "deepface-api/**",
  ]),
]);

export default eslintConfig;
