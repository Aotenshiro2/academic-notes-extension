import type { SiteStrategy } from './types'
import { skoolStrategy } from './strategies/skool'
import { tradingViewStrategy } from './strategies/tradingview'
import { gmailStrategy, outlookStrategy } from './strategies/email'
import { topStepStrategy } from './strategies/topstep'
import { topStepXTradeStrategy, topStepXStatsStrategy } from './strategies/topstepx'
import { tradovateStrategy } from './strategies/tradovate'
import { forexFactoryStrategy } from './strategies/forex-factory'
import { investingStrategy } from './strategies/investing'
import { youtubeStrategy } from './strategies/youtube'
import { genericArticleStrategy } from './strategies/generic-article'

const strategies: SiteStrategy[] = [
  // Video
  youtubeStrategy,
  // Prop firms — TopStepX path-specific first (higher priority)
  topStepXTradeStrategy,
  topStepXStatsStrategy,
  topStepStrategy,
  tradovateStrategy,
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
