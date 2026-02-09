import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconExternal, IconTrash } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonInput, LemonSelect, LemonSkeleton, LemonTag, Link } from '@posthog/lemon-ui'

import api from 'lib/api'
import { SlackChannelPicker } from 'lib/integrations/SlackIntegrationHelpers'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { PendingAlertNotification } from 'lib/utils/alertUtils'
import { urls } from 'scenes/urls'

import { HogFunctionType } from '~/types'

import { alertNotificationLogic } from '../alertNotificationLogic'

type NotificationType = 'slack' | 'webhook'

const notificationTypeOptions = [
    { label: 'Slack', value: 'slack' as const },
    { label: 'Webhook', value: 'webhook' as const },
]

function getHogFunctionDestination(hf: HogFunctionType): { type: string; detail: string | null } {
    const channelValue = hf.inputs?.channel?.value
    if (channelValue) {
        const channelName = typeof channelValue === 'string' ? channelValue.split('|')[1]?.replace('#', '') : null
        return { type: 'Slack', detail: channelName ? `#${channelName}` : null }
    }
    const urlValue = hf.inputs?.url?.value
    if (urlValue && typeof urlValue === 'string') {
        return { type: 'Webhook', detail: urlValue }
    }
    return { type: hf.name, detail: null }
}

interface InlineAlertNotificationsProps {
    alertId?: string
}

export function InlineAlertNotifications({ alertId }: InlineAlertNotificationsProps): JSX.Element {
    const logic = alertNotificationLogic({ alertId })
    const { existingHogFunctions, existingHogFunctionsLoading, pendingNotifications } = useValues(logic)
    const { addPendingNotification, removePendingNotification, deleteExistingHogFunction } = useActions(logic)

    const { slackIntegrations } = useValues(integrationsLogic)
    const firstSlackIntegration = slackIntegrations?.[0]

    const [selectedType, setSelectedType] = useState<NotificationType>(firstSlackIntegration ? 'slack' : 'webhook')
    const [slackChannelValue, setSlackChannelValue] = useState<string | null>(null)
    const [webhookUrl, setWebhookUrl] = useState('')

    const handleAdd = (): void => {
        if (selectedType === 'slack') {
            if (!slackChannelValue) {
                return
            }
            const channelName = slackChannelValue.split('|')[1]?.replace('#', '') ?? slackChannelValue

            const notification: PendingAlertNotification = {
                type: 'slack',
                slackWorkspaceId: firstSlackIntegration?.id,
                slackChannelId: slackChannelValue,
                slackChannelName: channelName,
            }
            addPendingNotification(notification)
            setSlackChannelValue(null)
        } else {
            if (!webhookUrl) {
                return
            }
            addPendingNotification({ type: 'webhook', webhookUrl })
            setWebhookUrl('')
        }
    }

    const getNotificationLabel = (notification: PendingAlertNotification): string => {
        if (notification.type === 'slack') {
            return `Slack: #${notification.slackChannelName ?? 'channel'}`
        }
        return `Webhook: ${notification.webhookUrl}`
    }

    return (
        <div className="space-y-4">
            {alertId && (
                <div>
                    {existingHogFunctionsLoading ? (
                        <LemonSkeleton className="h-8" repeat={2} />
                    ) : existingHogFunctions.length > 0 ? (
                        <div className="space-y-2">
                            {existingHogFunctions.map((hf) => {
                                const { type: destType, detail } = getHogFunctionDestination(hf)
                                return (
                                    <div
                                        key={hf.id}
                                        className="flex items-center justify-between border rounded p-2 gap-2"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{destType}</span>
                                                <LemonTag type={hf.enabled ? 'success' : 'default'} size="small">
                                                    {hf.enabled ? 'Active' : 'Paused'}
                                                </LemonTag>
                                            </div>
                                            {detail && (
                                                <span className="text-xs text-muted-alt truncate block">{detail}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <LemonButton
                                                icon={<IconExternal />}
                                                size="xsmall"
                                                to={urls.hogFunction(hf.id)}
                                                targetBlank
                                                hideExternalLinkIcon
                                                tooltip="Open destination"
                                            />
                                            <LemonButton
                                                icon={<IconTrash />}
                                                size="xsmall"
                                                status="danger"
                                                onClick={() => deleteExistingHogFunction(hf)}
                                                tooltip="Delete notification"
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : null}
                </div>
            )}

            {pendingNotifications.length > 0 && (
                <div className="space-y-2">
                    {pendingNotifications.map((notification, index) => (
                        <div key={index} className="flex items-center justify-between border rounded p-2 gap-2">
                            <span className="text-sm min-w-0 truncate">
                                {getNotificationLabel(notification)}{' '}
                                <span className="text-muted-alt">(pending - click Save to apply)</span>
                            </span>
                            <LemonButton
                                icon={<IconTrash />}
                                size="xsmall"
                                status="danger"
                                onClick={() => removePendingNotification(index)}
                                tooltip="Remove notification"
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-3 border rounded p-3">
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <LemonSelect
                            fullWidth
                            options={notificationTypeOptions}
                            value={selectedType}
                            onChange={(value) => setSelectedType(value)}
                        />
                    </div>
                </div>

                {selectedType === 'slack' && (
                    <>
                        {!firstSlackIntegration ? (
                            <LemonBanner type="info">
                                <div className="flex justify-between gap-2 items-center">
                                    <span>
                                        Slack is not yet configured for this project. Add PostHog to your Slack
                                        workspace to continue.
                                    </span>
                                    <Link
                                        to={api.integrations.authorizeUrl({
                                            kind: 'slack',
                                            next: window.location.pathname + '?target_type=slack',
                                        })}
                                        disableClientSideRouting
                                    >
                                        <img
                                            alt="Add to Slack"
                                            height="40"
                                            width="139"
                                            src="https://platform.slack-edge.com/img/add_to_slack.png"
                                            srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
                                        />
                                    </Link>
                                </div>
                            </LemonBanner>
                        ) : (
                            <SlackChannelPicker
                                value={slackChannelValue ?? undefined}
                                onChange={(value) => setSlackChannelValue(value)}
                                integration={firstSlackIntegration}
                            />
                        )}
                    </>
                )}

                {selectedType === 'webhook' && (
                    <LemonInput
                        placeholder="https://example.com/webhook"
                        value={webhookUrl}
                        onChange={setWebhookUrl}
                        fullWidth
                    />
                )}

                <LemonButton
                    type="secondary"
                    size="small"
                    onClick={handleAdd}
                    disabledReason={
                        selectedType === 'slack'
                            ? !firstSlackIntegration
                                ? 'Connect Slack first'
                                : !slackChannelValue
                                  ? 'Select a Slack channel'
                                  : undefined
                            : !webhookUrl
                              ? 'Enter a webhook URL'
                              : undefined
                    }
                >
                    Add notification
                </LemonButton>
            </div>
        </div>
    )
}
