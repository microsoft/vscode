import type { Api } from '../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api
