import type { Booking, Lead } from './types'

export type RecoveryHeaderStatus = 'Recovered' | 'Recovery active' | 'Booked'
export type RecoveryStatusTone = 'success' | 'warning' | 'neutral'
export type RecoveryEscalationLabel = 'Recovery complete' | 'Escalation active' | 'No-show waiting'
export type RecoveryEscalationTone = 'success' | 'critical' | 'watch'
export type RecoveryPipelineLabel = 'Booked' | 'No-show' | 'Recovery' | 'Recovered'
export type RecoveryPipelineState = 'complete' | 'active' | 'upcoming'
export type RecoveryRailCardTone = 'success' | 'warning' | 'neutral'

export type RecoveryDisplayInput = {
  lead: Lead | null | undefined
  booking: Booking | null | undefined
  escalationSignalCount: number
}

export type RecoveryPipelineEntry = {
  label: RecoveryPipelineLabel
  summary: string
  state: RecoveryPipelineState
}

export type RecoveryRailCard = {
  title: 'Booking recovered' | 'Recovery in progress' | 'Recovery pending' | 'Next operator step'
  eyebrow: string
  body: string
  tone: RecoveryRailCardTone
}

export type RecoveryDisplayModel = {
  headerStatus: RecoveryHeaderStatus
  statusTone: RecoveryStatusTone
  summary: string
  escalationLabel: RecoveryEscalationLabel
  escalationTone: RecoveryEscalationTone
  pipeline: RecoveryPipelineEntry[]
  railCards: RecoveryRailCard[]
}

function normalizeBookingStatus(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
}

function hasBookingSignal(status: string) {
  return status === 'booked' || status === 'reminded' || status === 'rescheduled'
}

function getRecoverySummary({
  bookingStatus,
  isRecovered,
  isRecoveryActive,
  isNoShowWaiting,
}: {
  bookingStatus: string
  isRecovered: boolean
  isRecoveryActive: boolean
  isNoShowWaiting: boolean
}) {
  if (isRecovered) {
    return 'Recovered after no-show with one-click rebook'
  }

  if (isRecoveryActive) {
    return 'Attendance miss recorded; recovery branch is active.'
  }

  if (isNoShowWaiting) {
    return 'Attendance miss recorded; recovery branch is waiting.'
  }

  if (bookingStatus === 'booked' || bookingStatus === 'reminded' || bookingStatus === 'rescheduled') {
    return 'Booked consult routed to the assigned closer.'
  }

  return 'Recovery workflow metadata is not yet available.'
}

export function getRecoveryDisplayModel({
  lead,
  booking,
  escalationSignalCount,
}: RecoveryDisplayInput): RecoveryDisplayModel {
  const bookingStatus = normalizeBookingStatus(booking?.status)
  const leadStage = lead?.stage ?? null
  const isRecovered = bookingStatus === 'recovered'
  const isNoShow = bookingStatus === 'no-show' || leadStage === 'no-show'
  const isRecoveryActive = leadStage === 'recovery'
  const isNoShowWaiting = isNoShow && !isRecovered && !isRecoveryActive
  const isBooked = hasBookingSignal(bookingStatus) || leadStage === 'booked'

  const headerStatus: RecoveryHeaderStatus = isRecovered
    ? 'Recovered'
    : isRecoveryActive
      ? 'Recovery active'
      : 'Booked'

  const statusTone: RecoveryStatusTone = isRecovered
    ? 'success'
    : isRecoveryActive || isNoShowWaiting
      ? 'warning'
      : 'neutral'

  const summary = getRecoverySummary({
    bookingStatus,
    isRecovered,
    isRecoveryActive,
    isNoShowWaiting,
  })

  const escalationLabel: RecoveryEscalationLabel = isRecovered
    ? 'Recovery complete'
    : escalationSignalCount > 0
      ? 'Escalation active'
      : 'No-show waiting'

  const escalationTone: RecoveryEscalationTone = isRecovered
    ? 'success'
    : escalationSignalCount > 0
      ? 'critical'
      : 'watch'

  const pipeline: RecoveryPipelineEntry[] = [
    {
      label: 'Booked',
      summary: `Booked consult and routed to ${booking?.owner ?? lead?.owner ?? 'Unassigned'}.`,
      state: isRecovered || isNoShowWaiting || isRecoveryActive || isBooked ? 'complete' : 'upcoming',
    },
    {
      label: 'No-show',
      summary: isRecovered || isRecoveryActive
        ? 'Attendance miss recorded before the recovery branch was triggered.'
        : 'Waiting for attendance timeout before recovery escalation.',
      state: isRecovered
        ? 'complete'
        : isRecoveryActive
          ? 'complete'
          : isNoShowWaiting
            ? 'active'
            : 'upcoming',
    },
    {
      label: 'Recovery',
      summary: isRecovered
        ? 'Recovery branch completed with proof and one-click rebook.'
        : isRecoveryActive
          ? 'No-show branch active with queued proof and rebook actions.'
          : 'Recovery branch not triggered yet.',
      state: isRecovered ? 'complete' : isRecoveryActive ? 'active' : 'upcoming',
    },
    {
      label: 'Recovered',
      summary: isRecovered
        ? 'Lead converted from no-show through the recovery workflow.'
        : 'Rebook is pending if recovery follow-up succeeds.',
      state: isRecovered ? 'active' : 'upcoming',
    },
  ]

  const proofCard: RecoveryRailCard = isRecovered
    ? {
        eyebrow: 'Proof',
        title: 'Booking recovered',
        tone: 'success',
        body: booking?.recoveryAction ?? 'Recovery proof captured.',
      }
    : isRecoveryActive
      ? {
          eyebrow: 'Proof',
          title: 'Recovery in progress',
          tone: 'warning',
          body: booking?.recoveryAction ?? 'Attendance miss recorded and recovery branch is queued.',
        }
      : {
          eyebrow: 'Proof',
          title: 'Recovery pending',
          tone: 'neutral',
          body: booking?.recoveryAction ?? 'Awaiting attendance timeout before recovery escalation.',
        }

  const railCards: RecoveryRailCard[] = [
    proofCard,
    {
      eyebrow: 'Next action',
      title: 'Next operator step',
      tone: 'neutral',
      body: lead?.nextAction ?? 'No next operator step queued.',
    },
  ]

  return {
    headerStatus,
    statusTone,
    summary,
    escalationLabel,
    escalationTone,
    pipeline,
    railCards,
  }
}
