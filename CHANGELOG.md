# Changelog

All notable changes to Narco Compliance are documented in this file.

## [v1.0-beta] - 2026-07-08

### Added

- Narco Compliance branded RTL dashboard and responsive workspace.
- Local login sessions with administrator and committee roles.
- Fixed local user management with committee activation controls.
- Leaflet facility map with marker clustering, navigation, search, and filters.
- Operational dashboard KPIs and clickable facility drilldowns.
- Facility visit workflow with dates, results, violations, notes, and persistent
  visit history.
- Latest-visit status derivation and annual visit progress.
- Assignment lifecycle states: assigned, in progress, completed, and cancelled.
- Administrator committee workload cards and assignment drilldowns.
- Manual single-facility and bulk Assignment Board workflows.
- Committee assigned-facility queue and return navigation.
- Smart nearest-facility assignment using Haversine distance.
- Optional smart-assignment starting facility with committee-history and Riyadh
  center fallbacks.

### Persistence

- Users, sessions, facility status, visit history, and assignments are stored in
  browser `localStorage`.
- Legacy assignment records without a lifecycle status default to `assigned`.

### Beta notes

- The application is frontend-only and has no backend authentication.
- Fixed user credentials and operational data are local to each browser.
- Bootstrap, Leaflet, MarkerCluster, Font Awesome, and map tiles are loaded from
  external services.
