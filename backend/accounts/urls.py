from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView, LoginView, GoogleLoginView, MeView,
    AdminUserListView, AdminUpdateUserRoleView, AdminStatsView,
    AdminSetUserActiveView, AdminAccessListCreateView, AdminAccessDeleteView,
    MyRecruiterAccessView, RevokeRecruiterAccessView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),

    # candidate: control which recruiters can see my results
    path("share/", MyRecruiterAccessView.as_view(), name="share-list-create"),
    path("share/<int:recruiter_id>/", RevokeRecruiterAccessView.as_view(), name="share-revoke"),

    # admin
    path("admin/users/", AdminUserListView.as_view(), name="admin-users"),
    path("admin/users/<int:user_id>/role/", AdminUpdateUserRoleView.as_view(), name="admin-user-role"),
    path("admin/users/<int:user_id>/active/", AdminSetUserActiveView.as_view(), name="admin-user-active"),
    path("admin/stats/", AdminStatsView.as_view(), name="admin-stats"),
    path("admin/access/", AdminAccessListCreateView.as_view(), name="admin-access"),
    path("admin/access/<int:access_id>/", AdminAccessDeleteView.as_view(), name="admin-access-delete"),
]
