-- Disposable CI database only. Emulate the original project's geometry column.
-- Drop dependent read objects, then schema.sql recreates them without data loss.
drop function if exists public.get_complaints_in_bounds(double precision,double precision,double precision,double precision);
drop view public.complaint_details;
alter table public.complaints alter column location type geometry(Point,4326) using location::geometry;
