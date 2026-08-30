import type { SiteStrategy } from './types'
import { skoolStrategy } from './strategies/skool'
import { tradingViewStrategy } from './strategies/tradingview'
import { gmailStrategy, outlookStrategy } from './strategies/email'
import {
  topStepDashboardStrategy,
  topStepAccountsStrategy,
  topStepBillingStrategy,
  topStepPayoutsStrategy,
  topStepGenericStrategy,
} from './strategies/topstep'
import { topStepXTradeStrategy, topStepXStatsStrategy, topStepXGenericStrategy } from './strategies/topstepx'
import { tradovateStrategy } from './strategies/tradovate'
import { simpleFxStrategy } from './strategies/simplefx'
import { forexFactoryStrategy } from './strategies/forex-factory'
import { investingStrategy } from './strategies/investing'
import { youtubeStrategy } from './strategies/youtube'
import { genericArticleStrategy } from './strategies/generic-article'

const strategies: SiteStrategy[] = [
  // Video
  youtubeStrategy,
  // Prop firms — TopStepX path-specific first (higher priority), generic catch-all last
  topStepXTradeStrategy,
  topStepXStatsStrategy,
  topStepXGenericStrategy,
  // TopStep.com — path-specific first (priority 20), generic catch-all last (priority 5)
  topStepDashboardStrategy,
  topStepAccountsStrategy,
  topStepBillingStrategy,
  topStepPayoutsStrategy,
  topStepGenericStrategy,
  tradovateStrategy,
  // SimpleFX — 5e site le plus capturé, sans stratégie jusqu'à la 1.8.0 :
  // ses captures tombaient sur le fallback générique et ne donnaient rien.
  simpleFxStrategy,
  // Trading
  tradingViewStrategy,
  // Community
  skoolStrategy,
  // Calendriers économiques
  forexFactoryStrategy,
  investingStrategy,
  // Email
  gmailStrategy,
  outlookStrategy,
  // Fallback — lowest priority, matches everything
  genericArticleStrategy,
]

export function findStrategy(url: string): SiteStrategy | undefined {
  const matches = strategies.filter(s => s.match(url))
  if (matches.length === 0) return undefined
  if (matches.length === 1) return matches[0]
  return matches.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
}
