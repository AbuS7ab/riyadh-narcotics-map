# Changelog

## [v0.14.16] - 2026-09-06

- Added active facilities created or reactivated during a periodic cycle to
  that same cycle so they become eligible for assignment immediately.
- Reconciled facilities already added after the cycle began, including
  `GOV-0090`, the next time an Admin loads the platform.
- Recorded each mid-cycle facility addition in cycle metadata without changing
  existing visits, assignments, or historical cycles.

## [v0.14.15] - 2026-09-05

- Replaced the assignment district select with a searchable district picker.
- Populated the picker from the cleaned Riyadh district list while retaining
  districts that already exist on active facility records.
- Allowed partial district typing to narrow visible facilities, but required a
  complete listed district before manual or smart assignment can be saved.
- Preserved all existing visits, assignments, cycles, and dashboard statistics.

## [v0.14.14] - 2026-09-05

- Added a district selector to the Admin facility-assignment board.
- Combined district selection with the existing assignment search and visible
  result count without changing stored facilities, visits, or statistics.
- Restricted smart-assignment candidates and starting facilities to the
  selected district while preserving the existing all-district behavior.

## [v0.14.13] - 2026-09-04

- Anchored each new periodic cycle to its local start date.
- Counted periodic visits dated on or after the active cycle start inside that
  cycle, including visits completed from an older still-open assignment.
- Updated the matching assignment cycle metadata only when its visit is saved,
  while preserving all historical visits and reactive work unchanged.

## [v0.14.12] - 2026-08-29

- Added read-only year and periodic-cycle selectors above the operational KPIs.
- Preserved the existing cumulative dashboard as the default view with its
  original calculations unchanged.
- Scoped pending, visited, incomplete, violation, completion-rate, map, and
  facility-list filters to the selected cycle using saved cycle identifiers.
- Exposed legacy periodic visits without a cycle identifier as a separate
  historical baseline instead of rewriting or guessing their cycle.

## [v0.14.11] - 2026-08-29

- Kept the periodic-cycle action clickable so an administrator receives the
  exact blocking reason instead of a silent disabled control.
- Added an explicit Admin override that starts a new cycle and makes every
  active, currently unassigned facility immediately available while preserving
  visits, open assignments, and assignment history.
- Recorded an administratively replaced incomplete cycle as closed rather than
  falsely marking it completed.

## [v0.14.6] - 2026-08-01

- Added an Admin return button from facility details to the selected
  committee's assigned-facility list.
- Preserved the selected committee and its active assigned-list filter when
  returning from a facility drilldown.

## [v0.14.5] - 2026-08-01

- Defaulted employee performance to the current year so a new calendar month
  does not make historical activity appear to be lost.
- Renamed the committee action to `تسجيل زيارة تفاعلية` and added complaint,
  report, and verification reasons.
- Added an optional manual transaction number to visit records and history.

## [v0.14.0] - 2026-07-30

- Allowed a committee to open a new reactive visit after a completed assignment.
- Restricted committee-initiated visits to the complaint reason only.
- Preserved the completed assignment and all prior visits in history.
- Prevented a committee from replacing another committee's active assignment.

## [v0.13.0] - 2026-07-30

- Made violation follow-up cards interactive with facility drilldowns.
- Required and clearly displayed the correction reason in the action timeline.
- Removed the average processing-days indicator.
- Collapsed the cancelled-facility archive by default without deleting records.
- Refined committee cards and facility search presentation.

## [v0.11.0] - 2026-07-29

- Added date-range export of field visits into the official `نموذج ب` Excel template.
- Preserved the template layout and left transaction number, health affairs,
  visit reason, statistics submission date, and notes blank.
- Exported each visit as a separate row with the facility, date, visit type,
  city, and historical committee participants.

All notable changes to Narco Compliance are documented in this file.

## [v0.10.0] - 2026-07-28

### Added

- Administrator-controlled periodic visit cycles that snapshot all active
  facilities without editing existing visits or assignments.
- A configurable minimum interval between periodic visits, defaulting to 75
  days, with live eligibility, due-soon, waiting, assigned, and completed
  counts.
- Assignment history archiving before a completed assignment is replaced by a
  new cycle assignment.
- Cycle identifiers on assignments and visits so each cycle is measured
  independently.

### Safety

- A cycle cannot start until every active facility has a completed first visit.
- Periodic assignment excludes recently visited facilities while reactive work
  remains available outside the interval rule.
- Reassignment uses compensating cloud writes so a failed assignment write
  restores the previous history state.
- Committee workload status is derived from the current assignment instead of
  a facility's older visit status.

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
