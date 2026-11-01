// The kinds of design the Design page makes, and the sizes the canvas shows them at.
import type { DesignKind } from './types'

/** A width the canvas renders a design at. With a height it's a device frame; without, it fills the canvas. */
export interface Viewport {
  key: string
  label: string
  width: number
  height?: number
  icon: string
}

const DESKTOP: Viewport = { key: 'desktop', label: 'Desktop', width: 1440, icon: 'monitor' }
const TABLET: Viewport = { key: 'tablet', label: 'Tablet', width: 834, height: 1112, icon: 'tablet' }
const MOBILE: Viewport = { key: 'mobile', label: 'Mobile', width: 390, height: 844, icon: 'phone' }
const SLIDES: Viewport = { key: 'slides', label: 'Slides', width: 1920, icon: 'slides' }
const PAGE: Viewport = { key: 'page', label: 'Page', width: 900, icon: 'file' }

export interface DesignKindInfo {
  value: DesignKind
  label: string
  icon: string
  hint: string
  placeholder: string
  examples: string[]
  /** the first one is the default */
  viewports: Viewport[]
}

export const DESIGN_KINDS: DesignKindInfo[] = [
  {
    value: 'prototype',
    label: 'Prototype',
    icon: 'cursor',
    hint: 'A clickable app or website',
    placeholder: 'Describe the app or site, like “a sign-up flow for a meal-planning app: welcome, pick a diet, choose a plan”',
    examples: ['A habit tracker app with a today view, streaks and a weekly chart', 'A landing page for a local bakery that takes pre-orders'],
    viewports: [DESKTOP, TABLET, MOBILE]
  },
  {
    value: 'slides',
    label: 'Slide deck',
    icon: 'slides',
    hint: 'A presentation, exported as PDF',
    placeholder: 'What’s the deck about, who is it for, and roughly how many slides?',
    examples: ['A 6-slide pitch deck for a solar-powered phone charger', 'A quarterly review: revenue up 18%, two new hires, next quarter’s goals'],
    viewports: [SLIDES]
  },
  {
    value: 'wireframe',
    label: 'Wireframe',
    icon: 'layout',
    hint: 'Low-fidelity layout and flow',
    placeholder: 'Which screens, and what should each one let people do?',
    examples: ['Checkout flow for an online shop: cart, address, payment, confirmation', 'Admin dashboard for a clinic: appointments, patients, billing'],
    viewports: [DESKTOP, TABLET, MOBILE]
  },
  {
    value: 'onepager',
    label: 'One-pager',
    icon: 'file',
    hint: 'A printable page: flyer, poster, résumé',
    placeholder: 'What goes on the page, and what’s it for?',
    examples: ['A one-page product sheet for a smart thermostat', 'A flyer for a weekend community cleanup drive'],
    viewports: [PAGE]
  },
  {
    value: 'other',
    label: 'Other',
    icon: 'sparkle',
    hint: 'Anything visual',
    placeholder: 'Describe what you want to design',
    examples: ['An email newsletter announcing a new feature', 'A set of 4 social media posts for a coffee brand'],
    viewports: [DESKTOP, TABLET, MOBILE]
  }
]

export function designKind(kind: DesignKind | undefined): DesignKindInfo {
  return DESIGN_KINDS.find((k) => k.value === kind) ?? DESIGN_KINDS[DESIGN_KINDS.length - 1]
}
