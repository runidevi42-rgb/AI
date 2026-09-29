import { config } from '../config.js';

export interface CollegeDateTime {
  timezone: string;
  date: string;
  time: string;
  weekday: string;
  hour: number;
  minute: number;
  second: number;
}

function parts(value: Date) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.COLLEGE_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(formatted.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function localDateTimeToUtc(date: string, time: string) {
  const desired = Date.parse(`${date}T${time}Z`);
  const initial = new Date(desired);
  const local = parts(initial);
  const interpretedAsUtc = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute), Number(local.second));
  return new Date(desired - (interpretedAsUtc - desired));
}

/** Returns the current date and clock in the college timezone, independent of the server timezone. */
export function getCurrentCollegeDateTime(value = new Date()): CollegeDateTime {
  const current = parts(value);
  const hour = Number(current.hour);
  const minute = Number(current.minute);
  const second = Number(current.second);
  return {
    timezone: config.COLLEGE_TIMEZONE,
    date: `${current.year}-${current.month}-${current.day}`,
    time: `${current.hour}:${current.minute}:${current.second}`,
    weekday: current.weekday,
    hour,
    minute,
    second,
  };
}

export function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatCollegeTime(value: string | null | undefined) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function collegeDateBounds(date: string) {
  return {
    start: localDateTimeToUtc(date, '00:00:00').toISOString(),
    end: localDateTimeToUtc(date, '23:59:59').toISOString(),
  };
}
