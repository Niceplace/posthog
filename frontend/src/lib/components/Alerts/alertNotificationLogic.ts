import { actions, afterMount, connect, kea, key, listeners, path, props, reducers } from 'kea'
import { loaders } from 'kea-loaders'

import api from 'lib/api'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'
import { PendingAlertNotification, buildAlertFilterConfig, buildHogFunctionPayload } from 'lib/utils/alertUtils'
import { deleteWithUndo } from 'lib/utils/deleteWithUndo'
import { projectLogic } from 'scenes/projectLogic'

import { HogFunctionType } from '~/types'

import type { alertNotificationLogicType } from './alertNotificationLogicType'

export interface AlertNotificationLogicProps {
    alertId?: string
}

export const alertNotificationLogic = kea<alertNotificationLogicType>([
    path(['lib', 'components', 'Alerts', 'alertNotificationLogic']),
    props({} as AlertNotificationLogicProps),
    key(({ alertId }) => alertId ?? 'new'),

    connect({
        values: [projectLogic, ['currentProjectId']],
    }),

    actions({
        addPendingNotification: (notification: PendingAlertNotification) => ({ notification }),
        removePendingNotification: (index: number) => ({ index }),
        clearPendingNotifications: true,
        setPendingNotifications: (notifications: PendingAlertNotification[]) => ({ notifications }),
        deleteExistingHogFunction: (hogFunction: HogFunctionType) => ({ hogFunction }),
        createPendingHogFunctions: (alertId: string) => ({ alertId }),
    }),

    reducers({
        pendingNotifications: [
            [] as PendingAlertNotification[],
            {
                addPendingNotification: (state, { notification }) => [...state, notification],
                removePendingNotification: (state, { index }) => state.filter((_, i) => i !== index),
                clearPendingNotifications: () => [],
                setPendingNotifications: (_, { notifications }) => notifications,
            },
        ],
    }),

    loaders(({ props }) => ({
        existingHogFunctions: [
            [] as HogFunctionType[],
            {
                loadExistingHogFunctions: async () => {
                    if (!props.alertId) {
                        return []
                    }
                    const response = await api.hogFunctions.list({
                        types: ['internal_destination'],
                        filter_groups: [buildAlertFilterConfig(props.alertId)],
                        full: true,
                    })
                    return response.results
                },
            },
        ],
    })),

    // Optimistic removal so the item disappears immediately
    reducers({
        existingHogFunctions: {
            deleteExistingHogFunction: (state, { hogFunction }) => state.filter((hf) => hf.id !== hogFunction.id),
        },
    }),

    listeners(({ actions, values }) => ({
        deleteExistingHogFunction: async ({ hogFunction }) => {
            await deleteWithUndo({
                endpoint: `projects/${values.currentProjectId}/hog_functions`,
                object: {
                    id: hogFunction.id,
                    name: hogFunction.name,
                },
                callback: (undo) => {
                    if (undo) {
                        actions.loadExistingHogFunctions()
                    }
                },
            })
        },

        createPendingHogFunctions: async ({ alertId }) => {
            const pending = values.pendingNotifications
            if (pending.length === 0) {
                return
            }

            const results = await Promise.allSettled(
                pending.map((notification) => {
                    const payload = buildHogFunctionPayload(alertId, notification)
                    return api.hogFunctions.create(payload)
                })
            )

            const failures = results.filter((r) => r.status === 'rejected')
            const failedNotifications = pending.filter((_, i) => results[i].status === 'rejected')

            if (failures.length > 0) {
                lemonToast.error(`Failed to create ${failures.length} notification(s).`)
                actions.setPendingNotifications(failedNotifications)
            } else {
                if (results.length > 0) {
                    lemonToast.success(`${results.length} notification destination(s) created.`)
                }
                actions.clearPendingNotifications()
            }

            actions.loadExistingHogFunctions()
        },
    })),

    afterMount(({ actions, props }) => {
        if (props.alertId) {
            actions.loadExistingHogFunctions()
        }
    }),
])
