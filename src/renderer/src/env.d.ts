/// <reference types="vite/client" />

import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
