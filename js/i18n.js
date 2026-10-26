// UI text. Arabic is the main language, English optional; the choice is remembered.

const AR = {
  'app.title': 'حضور لفيف',
  'lang.switch': 'English',
  'banner.local': 'هذا الهاتف فقط — بدون خادم أو مزامنة',
  'install.hint': 'للعمل دون إنترنت: اضغط زر المشاركة في Safari ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من أيقونته.',
  'storage.error': 'تعذّر فتح التخزين على هذا الجهاز. لا تستخدم التصفّح الخاص، وأعد فتح الصفحة.',
  'action.back': 'رجوع',
  'action.cancel': 'إلغاء',

  'events.title': 'الفعاليات',
  'events.new': 'فعالية جديدة',
  'events.empty': 'لا توجد فعاليات بعد. أنشئ فعالية ثم استورد ملف Excel.',
  'events.participants': '{0} مشارك',
  'events.checkedIn': '{0} حضروا',
  'status.OPEN': 'التسجيل مفتوح',
  'status.CLOSED': 'التسجيل مغلق',

  'create.title': 'فعالية جديدة',
  'create.name': 'اسم الفعالية',
  'create.date': 'التاريخ',
  'create.zone': 'المنطقة الزمنية',
  'create.button': 'إنشاء',
  'create.badZone': 'المنطقة الزمنية غير صحيحة (مثال: Asia/Damascus)',

  'dash.total': 'المشاركون',
  'dash.in': 'حضروا',
  'dash.left': 'المتبقّون',
  'dash.dup': 'مسح مكرّر',
  'dash.unknown': 'تذاكر غير معروفة',
  'dash.progress': 'نسبة الحضور {0}%',
  'dash.noList': 'لم تُستورد قائمة المشاركين بعد. ابدأ باستيراد ملف Excel.',
  'dash.source': 'الملف: {0}',
  'dash.open': 'التسجيل مفتوح',
  'dash.exportReminder': 'لا توجد نسخة أخرى من التسجيلات على أي جهاز آخر: صدّر ملف Excel بعد الفعالية.',
  'action.scan': 'بدء المسح',
  'action.manual': 'إدخال رقم التذكرة يدوياً',
  'action.list': 'قائمة الحضور',
  'action.import': 'استيراد ملف Excel',
  'action.export': 'تصدير ملف Excel محدّث',

  'import.title': 'استيراد ملف Excel',
  'import.intro': 'اختر ملف ‎.xlsx‎ المصدَّر من لفيف (ورقة Attendance بالأعمدة السبعة).',
  'import.pick': 'اختيار ملف',
  'import.reading': 'جارٍ قراءة الملف…',
  'import.summary': 'الملف {0} — الورقة {1} — {2} مشارك',
  'import.errors': 'لا يمكن حفظ القائمة قبل تصحيح الملف:',
  'import.warnings': 'ملاحظات:',
  'import.save': 'حفظ القائمة',
  'import.saving': 'جارٍ الحفظ…',
  'import.confirmReplace': 'تحتوي هذه الفعالية على قائمة من {0} مشارك. هل تريد استبدالها؟ تبقى تسجيلات الحضور المؤكدة محفوظة.',
  'import.done': 'تم حفظ {0} مشارك.',
  'import.doneDetail': 'نُقل {0} تسجيل حضور إلى القائمة الجديدة، و{1} مسجّلون مسبقاً في الملف، وحُذف {2}.',
  'import.missing': 'لا يمكن الاستبدال: هذه التذاكر مسجّلة الحضور وغير موجودة في الملف الجديد: {0}',
  'import.failed': 'تعذّر حفظ القائمة.',

  'issue.NOT_XLSX': 'الملف ليس ملف Excel بصيغة ‎.xlsx',
  'issue.CORRUPT_FILE': 'تعذّرت قراءة الملف؛ قد يكون تالفاً',
  'issue.FILE_TOO_LARGE': 'الملف كبير جداً',
  'issue.SHEET_NOT_FOUND': 'لا توجد ورقة باسم {value}',
  'issue.USED_OTHER_SHEET': 'لا توجد ورقة Attendance؛ استُخدمت الورقة {value}',
  'issue.EMPTY_SHEET': 'الورقة {value} فارغة',
  'issue.MISSING_COLUMN': 'العمود {value} غير موجود',
  'issue.DUPLICATE_COLUMN': 'العمود {value} مكرّر',
  'issue.MISSING_TICKET': 'رقم التذكرة فارغ في الصفوف: {rows}',
  'issue.DUPLICATE_TICKET': 'رقم التذكرة {value} مكرّر في الصفوف: {rows}',
  'issue.TICKET_TOO_LONG': 'رقم التذكرة طويل جداً في الصفوف: {rows}',
  'issue.NO_PARTICIPANTS': 'لا يوجد مشاركون في الملف',
  'issue.TOO_MANY_ROWS': 'عدد الصفوف أكبر من {value}',
  'issue.MISSING_NAME': 'الاسم فارغ في الصفوف: {rows}',
  'issue.HAS_ATTENDANCE': 'مشاركون مسجّل حضورهم مسبقاً في الملف (الصفوف: {rows})',

  'scan.title': 'مسح التذاكر',
  'scan.hint': 'وجّه الكاميرا نحو رمز QR على التذكرة',
  'scan.starting': 'جارٍ تشغيل الكاميرا…',
  'scan.denied': 'لا يمكن استخدام الكاميرا. اسمح بالوصول إلى الكاميرا (الإعدادات ← Safari ← الكاميرا)، أو التقط صورة للرمز، أو أدخل الرقم يدوياً.',
  'scan.photo': 'التقاط صورة للرمز',
  'scan.photoNoCode': 'لم يُعثر على رمز QR في الصورة. حاول مرة أخرى بإضاءة أفضل.',
  'scan.next': 'مسح التذكرة التالية',
  'scan.checking': 'جارٍ التحقق…',

  'result.SUCCESS': 'تم تسجيل الحضور',
  'result.DUPLICATE': 'التذكرة مستخدمة مسبقاً',
  'result.NOT_FOUND': 'التذكرة غير موجودة',
  'result.EVENT_CLOSED': 'التسجيل مغلق لهذه الفعالية',
  'result.ERROR': 'حدث خطأ؛ أعد المحاولة',
  'result.AMBIGUOUS': 'الرمز يحتوي أكثر من رقم تذكرة؛ أدخل الرقم يدوياً',
  'result.time': 'وقت الحضور: {0}',
  'result.dupByPhone': 'سُجّل حضوره سابقاً عند {0} — لا تُدخله مرة أخرى دون التحقق',
  'result.dupImported': 'مسجّل حضوره في الملف المستورد: {0}',
  'result.notFoundDetail': 'الرقم ليس في قائمة هذه الفعالية. لم يُسجَّل شيء.',
  'result.scanned': 'القيمة الممسوحة: {0}',

  'manual.title': 'إدخال رقم التذكرة',
  'manual.label': 'رقم التذكرة كما هو مطبوع',
  'manual.submit': 'تسجيل الحضور',

  'list.title': 'قائمة الحضور',
  'list.search': 'ابحث بالاسم أو رقم التذكرة',
  'list.all': 'الكل',
  'list.in': 'حضروا',
  'list.out': 'لم يحضروا',
  'list.count': '{0} من {1}',
  'list.more': 'تُعرض أول {0} نتيجة؛ ضيّق البحث لرؤية البقية',
  'list.empty': 'لا نتائج',
  'list.imported': 'في الملف: {0}',

  'export.working': 'جارٍ تجهيز الملف…',
  'export.ready': 'الملف جاهز: {0}',
  'export.save': 'حفظ / مشاركة الملف',
  'export.done': 'صُدّر {0} مشارك ({1} حضروا).',
  'export.failed': 'تعذّر التصدير.',
  'export.noList': 'لا توجد قائمة لتصديرها بعد.',
};

const EN = {
  'app.title': 'Lafeef Check-in',
  'lang.switch': 'العربية',
  'banner.local': 'This phone only — no server, no sync',
  'install.hint': 'To use it offline: tap Share in Safari, then “Add to Home Screen”, and open it from its icon.',
  'storage.error': 'Storage on this device could not be opened. Don’t use Private Browsing, then reopen the page.',
  'action.back': 'Back',
  'action.cancel': 'Cancel',

  'events.title': 'Events',
  'events.new': 'New event',
  'events.empty': 'No events yet. Create one, then import the Excel file.',
  'events.participants': '{0} participants',
  'events.checkedIn': '{0} checked in',
  'status.OPEN': 'Check-in open',
  'status.CLOSED': 'Check-in closed',

  'create.title': 'New event',
  'create.name': 'Event name',
  'create.date': 'Date',
  'create.zone': 'Time zone',
  'create.button': 'Create',
  'create.badZone': 'Invalid time zone (example: Asia/Damascus)',

  'dash.total': 'Participants',
  'dash.in': 'Checked in',
  'dash.left': 'Remaining',
  'dash.dup': 'Repeated scans',
  'dash.unknown': 'Unknown tickets',
  'dash.progress': '{0}% checked in',
  'dash.noList': 'No participant list yet. Start by importing the Excel file.',
  'dash.source': 'File: {0}',
  'dash.open': 'Check-in open',
  'dash.exportReminder': 'There is no other copy of these check-ins on any other device: export the Excel file after the event.',
  'action.scan': 'Start scanning',
  'action.manual': 'Enter ticket number',
  'action.list': 'Attendance list',
  'action.import': 'Import Excel file',
  'action.export': 'Export updated Excel',

  'import.title': 'Import Excel file',
  'import.intro': 'Choose the .xlsx exported from Lafeef (Attendance sheet with the seven columns).',
  'import.pick': 'Choose file',
  'import.reading': 'Reading the file…',
  'import.summary': 'File {0} — sheet {1} — {2} participants',
  'import.errors': 'The list can’t be saved until the file is fixed:',
  'import.warnings': 'Notes:',
  'import.save': 'Save the list',
  'import.saving': 'Saving…',
  'import.confirmReplace': 'This event already has a list of {0} participants. Replace it? Confirmed check-ins are kept.',
  'import.done': 'Saved {0} participants.',
  'import.doneDetail': '{0} check-ins carried over to the new list, {1} already marked in the file, {2} removed.',
  'import.missing': 'Can’t replace: these tickets are checked in but missing from the new file: {0}',
  'import.failed': 'The list could not be saved.',

  'issue.NOT_XLSX': 'The file is not an Excel .xlsx file',
  'issue.CORRUPT_FILE': 'The file could not be read; it may be damaged',
  'issue.FILE_TOO_LARGE': 'The file is too large',
  'issue.SHEET_NOT_FOUND': 'No sheet named {value}',
  'issue.USED_OTHER_SHEET': 'No Attendance sheet; used sheet {value}',
  'issue.EMPTY_SHEET': 'Sheet {value} is empty',
  'issue.MISSING_COLUMN': 'Column {value} is missing',
  'issue.DUPLICATE_COLUMN': 'Column {value} appears twice',
  'issue.MISSING_TICKET': 'Empty ticket number in rows: {rows}',
  'issue.DUPLICATE_TICKET': 'Ticket {value} repeated in rows: {rows}',
  'issue.TICKET_TOO_LONG': 'Ticket number too long in rows: {rows}',
  'issue.NO_PARTICIPANTS': 'No participants in the file',
  'issue.TOO_MANY_ROWS': 'More than {value} rows',
  'issue.MISSING_NAME': 'Empty name in rows: {rows}',
  'issue.HAS_ATTENDANCE': 'Already marked as attended in the file (rows: {rows})',

  'scan.title': 'Scan tickets',
  'scan.hint': 'Point the camera at the ticket’s QR code',
  'scan.starting': 'Starting the camera…',
  'scan.denied': 'The camera can’t be used. Allow camera access (Settings → Safari → Camera), take a photo of the code, or enter the number manually.',
  'scan.photo': 'Take a photo of the code',
  'scan.photoNoCode': 'No QR code found in the photo. Try again with better light.',
  'scan.next': 'Scan next ticket',
  'scan.checking': 'Checking…',

  'result.SUCCESS': 'Checked in',
  'result.DUPLICATE': 'Ticket already used',
  'result.NOT_FOUND': 'Ticket not found',
  'result.EVENT_CLOSED': 'Check-in is closed for this event',
  'result.ERROR': 'Something went wrong; try again',
  'result.AMBIGUOUS': 'The code contains more than one ticket number; enter it manually',
  'result.time': 'Checked in at {0}',
  'result.dupByPhone': 'Already checked in at {0} — don’t admit again without checking',
  'result.dupImported': 'Marked as attended in the imported file: {0}',
  'result.notFoundDetail': 'This number is not on this event’s list. Nothing was recorded.',
  'result.scanned': 'Scanned value: {0}',

  'manual.title': 'Enter ticket number',
  'manual.label': 'Ticket number as printed',
  'manual.submit': 'Check in',

  'list.title': 'Attendance list',
  'list.search': 'Search by name or ticket number',
  'list.all': 'All',
  'list.in': 'Checked in',
  'list.out': 'Not yet',
  'list.count': '{0} of {1}',
  'list.more': 'Showing the first {0}; refine the search to see the rest',
  'list.empty': 'No results',
  'list.imported': 'In the file: {0}',

  'export.working': 'Preparing the file…',
  'export.ready': 'File ready: {0}',
  'export.save': 'Save / share the file',
  'export.done': 'Exported {0} participants ({1} checked in).',
  'export.failed': 'Export failed.',
  'export.noList': 'There is no list to export yet.',
};

export const STRINGS = { ar: AR, en: EN };

const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

/** Keeps a value's own direction inside a sentence (dates, tickets, file names). */
export const isolate = (v) => FSI + String(v) + PDI;

let lang = 'ar';
try {
  const saved = localStorage.getItem('lang');
  if (saved === 'en' || saved === 'ar') lang = saved;
} catch {
  // Storage unavailable: Arabic for this session.
}

export const getLang = () => lang;

export function setLang(next) {
  lang = next;
  try {
    localStorage.setItem('lang', next);
  } catch {
    // The choice still applies until the page is closed.
  }
  applyLang();
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app.title');
}

/** t('key', a, b) fills {0}, {1}; t('key', {value, rows}) fills named slots. */
export function t(key, ...args) {
  let s = STRINGS[lang][key] ?? STRINGS.ar[key] ?? key;
  if (args.length === 1 && args[0] && typeof args[0] === 'object') {
    for (const [k, v] of Object.entries(args[0])) s = s.split(`{${k}}`).join(isolate(v));
    return s;
  }
  args.forEach((v, i) => { s = s.split(`{${i}}`).join(isolate(v)); });
  return s;
}
