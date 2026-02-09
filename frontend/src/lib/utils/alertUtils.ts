import { INSIGHT_ALERT_FIRING_EVENT_ID } from 'lib/constants'
import { HOG_FUNCTION_SUB_TEMPLATE_COMMON_PROPERTIES } from 'scenes/hog-functions/sub-templates/sub-templates'

import { CyclotronJobFiltersType, HogFunctionType, PropertyFilterType, PropertyOperator } from '~/types'

export const buildAlertFilterConfig = (alertId: string): CyclotronJobFiltersType => ({
    properties: [
        {
            key: 'alert_id',
            value: alertId,
            operator: PropertyOperator.Exact,
            type: PropertyFilterType.Event,
        },
    ],
    events: [
        {
            id: INSIGHT_ALERT_FIRING_EVENT_ID,
            type: 'events',
        },
    ],
})

const INSIGHT_ALERT_SLACK_INPUTS: Record<string, any> = {
    blocks: {
        value: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: "Alert '{event.properties.alert_name}' firing for insight '{event.properties.insight_name}'",
                },
            },
            {
                type: 'section',
                text: { type: 'plain_text', text: '{event.properties.breaches}' },
            },
            {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: 'Project: <{project.url}|{project.name}>' }],
            },
            { type: 'divider' },
            {
                type: 'actions',
                elements: [
                    {
                        url: '{project.url}/insights/{event.properties.insight_id}',
                        text: { text: 'View Insight', type: 'plain_text' },
                        type: 'button',
                    },
                    {
                        url: '{project.url}/insights/{event.properties.insight_id}/alerts?alert_id={event.properties.alert_id}',
                        text: { text: 'View Alert', type: 'plain_text' },
                        type: 'button',
                    },
                ],
            },
        ],
    },
    text: { value: 'Alert triggered: {event.properties.insight_name}' },
}

export type PendingAlertNotification = {
    type: 'slack' | 'webhook'
    slackWorkspaceId?: number
    slackChannelId?: string
    slackChannelName?: string
    webhookUrl?: string
}

export function buildHogFunctionPayload(
    alertId: string,
    notification: PendingAlertNotification
): Partial<HogFunctionType> {
    const commonProps = HOG_FUNCTION_SUB_TEMPLATE_COMMON_PROPERTIES['insight-alert-firing']
    const base = {
        type: commonProps.type,
        enabled: true,
        masking: null,
        filters: buildAlertFilterConfig(alertId),
    }

    if (notification.type === 'slack') {
        return {
            ...base,
            name: `Alert notification: Slack #${notification.slackChannelName ?? 'channel'}`,
            template_id: 'template-slack',
            inputs: {
                ...INSIGHT_ALERT_SLACK_INPUTS,
                slack_workspace: { value: notification.slackWorkspaceId },
                channel: { value: notification.slackChannelId },
            },
        }
    }

    return {
        ...base,
        name: `Alert notification: Webhook`,
        template_id: 'template-webhook',
        inputs: {
            url: { value: notification.webhookUrl },
            body: {
                value: {
                    alert_name: '{event.properties.alert_name}',
                    insight_name: '{event.properties.insight_name}',
                    breaches: '{event.properties.breaches}',
                    insight_url: '{project.url}/insights/{event.properties.insight_id}',
                    alert_url:
                        '{project.url}/insights/{event.properties.insight_id}/alerts?alert_id={event.properties.alert_id}',
                },
            },
        },
    }
}
