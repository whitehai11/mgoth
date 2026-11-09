import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
 {ignores:['dist/**','node_modules/**']},
 js.configs.recommended,
 ...tseslint.configs.recommended,
 {files:['**/*.{ts,tsx,js,mjs}'],languageOptions:{globals:{...globals.browser,...globals.node,URL:'readonly',console:'readonly'},parserOptions:{ecmaFeatures:{jsx:true}}},rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}}
);
