from django.conf import settings

from posthog.clickhouse.client.connection import NodeRole
from posthog.clickhouse.client.migration_tools import run_sql_with_exceptions
from posthog.clickhouse.logs.logs32 import TABLE_NAME

operations = [
    run_sql_with_exceptions(
        f"create TABLE if not exists {settings.CLICKHOUSE_LOGS_CLUSTER_DATABASE}.logs AS {settings.CLICKHOUSE_LOGS_CLUSTER_DATABASE}.{TABLE_NAME} ENGINE = Distributed('posthog', {settings.CLICKHOUSE_LOGS_CLUSTER_DATABASE}, '{TABLE_NAME}');",
        node_roles=[NodeRole.LOGS],
    ),
]
