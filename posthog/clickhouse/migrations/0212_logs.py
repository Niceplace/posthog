from django.conf import settings

from posthog.clickhouse.client.connection import NodeRole
from posthog.clickhouse.client.migration_tools import run_sql_with_exceptions

operations = [
    run_sql_with_exceptions(
        f"create or replace TABLE logs AS logs32 ENGINE = Distributed('default', {settings.CLICKHOUSE_LOGS_CLUSTER_DATABASE}, 'logs32');",
        node_roles=[NodeRole.LOGS],
    ),
]
