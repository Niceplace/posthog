from posthog.test.base import BaseTest

from parameterized import parameterized

from posthog.hogql.context import HogQLContext
from posthog.hogql.database.database import Database
from posthog.hogql.parser import parse_select
from posthog.hogql.printer import prepare_and_print_ast

SYSTEM_TABLES_WITH_TEAM_ID = [
    "actions",
    "cohort_calculation_history",
    "data_warehouse_tables",
    "error_tracking_issues",
    "notebooks",
]


class TestSystemTablesTeamScoping(BaseTest):
    @parameterized.expand(SYSTEM_TABLES_WITH_TEAM_ID)
    def test_system_table_has_team_id_filter(self, table_name):
        db = Database.create_for(team=self.team)
        context = HogQLContext(
            team_id=self.team.pk,
            enable_select_queries=True,
            database=db,
        )
        sql = f"SELECT * FROM system.{table_name}"
        query, _ = prepare_and_print_ast(parse_select(sql), context, dialect="clickhouse")
        assert f"equals(system__{table_name}.team_id, {self.team.pk})" in query
