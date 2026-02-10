from posthog.test.base import BaseTest
from unittest.mock import MagicMock, patch

from prometheus_client import CollectorRegistry

from posthog.models import FeatureFlag, Team
from posthog.models.organization import Organization
from posthog.tasks.feature_flags import compute_feature_flag_metrics


class TestComputeFeatureFlagMetrics(BaseTest):
    CLASS_DATA_LEVEL_SETUP = False

    def setUp(self) -> None:
        super().setUp()
        # Clean up any existing flags from other tests
        FeatureFlag.objects.all().delete()

        self.registry = CollectorRegistry()
        self.mock_context = MagicMock()
        self.mock_context.__enter__ = MagicMock(return_value=self.registry)
        self.mock_context.__exit__ = MagicMock(return_value=False)
        self.patcher = patch("posthog.tasks.utils.pushed_metrics_registry", return_value=self.mock_context)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()
        super().tearDown()

    def test_computes_metrics_for_single_team(self) -> None:
        FeatureFlag.objects.create(
            team=self.team,
            key="flag-1",
            created_by=self.user,
            filters={"groups": [{"properties": [], "rollout_percentage": 100}]},
        )

        compute_feature_flag_metrics()

        flag_count = self.registry.get_sample_value(
            "posthog_feature_flag_team_flag_count",
            {"rank": "1", "team_id": str(self.team.pk), "team_name": self.team.name},
        )
        assert flag_count == 1

    def test_excludes_deleted_and_inactive_flags(self) -> None:
        FeatureFlag.objects.create(
            team=self.team,
            key="active-flag",
            created_by=self.user,
            filters={"groups": []},
            active=True,
            deleted=False,
        )
        FeatureFlag.objects.create(
            team=self.team,
            key="deleted-flag",
            created_by=self.user,
            filters={"groups": []},
            active=True,
            deleted=True,
        )
        FeatureFlag.objects.create(
            team=self.team,
            key="inactive-flag",
            created_by=self.user,
            filters={"groups": []},
            active=False,
            deleted=False,
        )

        compute_feature_flag_metrics()

        flag_count = self.registry.get_sample_value(
            "posthog_feature_flag_team_flag_count",
            {"rank": "1", "team_id": str(self.team.pk), "team_name": self.team.name},
        )
        assert flag_count == 1

    def test_ranks_teams_by_flag_count(self) -> None:
        org = Organization.objects.create(name="Test Org")
        team_with_many = Team.objects.create(organization=org, name="Many Flags Team")
        team_with_few = Team.objects.create(organization=org, name="Few Flags Team")

        for i in range(5):
            FeatureFlag.objects.create(
                team=team_with_many,
                key=f"flag-{i}",
                created_by=self.user,
                filters={"groups": []},
            )

        FeatureFlag.objects.create(
            team=team_with_few,
            key="single-flag",
            created_by=self.user,
            filters={"groups": []},
        )

        compute_feature_flag_metrics()

        rank1_count = self.registry.get_sample_value(
            "posthog_feature_flag_team_flag_count",
            {"rank": "1", "team_id": str(team_with_many.pk), "team_name": "Many Flags Team"},
        )
        assert rank1_count == 5

        rank2_count = self.registry.get_sample_value(
            "posthog_feature_flag_team_flag_count",
            {"rank": "2", "team_id": str(team_with_few.pk), "team_name": "Few Flags Team"},
        )
        assert rank2_count == 1

    def test_measures_largest_flag_size(self) -> None:
        large_properties = [{"key": f"prop_{i}", "value": f"value_{i}" * 100, "type": "person"} for i in range(50)]
        large_filters = {
            "groups": [
                {"properties": large_properties},
                {"rollout_percentage": 50},
            ]
        }
        FeatureFlag.objects.create(
            team=self.team,
            key="large-flag",
            created_by=self.user,
            filters=large_filters,
        )

        compute_feature_flag_metrics()

        largest_flag_bytes = self.registry.get_sample_value(
            "posthog_feature_flag_team_largest_flag_bytes",
            {"rank": "1", "team_id": str(self.team.pk), "team_name": self.team.name},
        )
        assert largest_flag_bytes is not None
        assert largest_flag_bytes > 1000

    def test_measures_total_flag_size(self) -> None:
        for i in range(3):
            FeatureFlag.objects.create(
                team=self.team,
                key=f"flag-{i}",
                created_by=self.user,
                filters={"groups": [{"properties": [{"key": "test", "value": "value"}]}]},
            )

        compute_feature_flag_metrics()

        total_size = self.registry.get_sample_value(
            "posthog_feature_flag_team_total_size_bytes",
            {"rank": "1", "team_id": str(self.team.pk), "team_name": self.team.name},
        )
        assert total_size is not None
        assert total_size > 0

    def test_limits_to_top_5_teams(self) -> None:
        org = Organization.objects.create(name="Test Org")
        for i in range(7):
            team = Team.objects.create(organization=org, name=f"Team {i}")
            for j in range(i + 1):
                FeatureFlag.objects.create(
                    team=team,
                    key=f"flag-{j}",
                    created_by=self.user,
                    filters={"groups": []},
                )

        compute_feature_flag_metrics()

        for rank in range(1, 6):
            samples = [
                sample
                for metric in self.registry.collect()
                if hasattr(metric, "samples")
                for sample in metric.samples
                if sample.name == "posthog_feature_flag_team_flag_count" and sample.labels.get("rank") == str(rank)
            ]
            assert len(samples) == 1

        for rank in [6, 7]:
            samples = [
                sample
                for metric in self.registry.collect()
                if hasattr(metric, "samples")
                for sample in metric.samples
                if sample.name == "posthog_feature_flag_team_flag_count" and sample.labels.get("rank") == str(rank)
            ]
            assert len(samples) == 0

    def test_handles_team_with_no_name(self) -> None:
        org = Organization.objects.create(name="Test Org")
        team_no_name = Team.objects.create(organization=org, name="")
        FeatureFlag.objects.create(
            team=team_no_name,
            key="flag-1",
            created_by=self.user,
            filters={"groups": []},
        )

        compute_feature_flag_metrics()

        flag_count = self.registry.get_sample_value(
            "posthog_feature_flag_team_flag_count",
            {"rank": "1", "team_id": str(team_no_name.pk), "team_name": "Unknown"},
        )
        assert flag_count == 1

    def test_handles_empty_database(self) -> None:
        FeatureFlag.objects.all().delete()

        compute_feature_flag_metrics()

        samples = list(self.registry.collect())
        flag_count_samples = [
            sample
            for metric in samples
            if hasattr(metric, "samples")
            for sample in metric.samples
            if sample.name == "posthog_feature_flag_team_flag_count"
        ]
        assert len(flag_count_samples) == 0
