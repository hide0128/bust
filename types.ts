export interface BusService {
  /**
   * ルートID。CSVファイル名から生成されます。
   * 例: ファイル名が "RouteA.csv" の場合、"RouteA"
   */
  routeId: string;

  /**
   * バス停名。CSVファイル名から生成されます（routeId と同じ値になります）。
   * 例: ファイル名が "StationStop.csv" の場合、"StationStop"
   */
  stopName: string;

  /**
   * CSVファイルの '曜日' 列に対応します。
   * 例: "平日", "土曜日", "日祝"
   */
  dayOfWeek: string;

  /**
   * 出発時刻。"HH:MM" 形式の文字列。
   * CSVファイルの '時刻(時)' 列と '時刻(分)' 列から合成されます。
   * 例: 時刻(時)が "08", 時刻(分)が "30" の場合、"08:30"
   */
  departureTime: string;

  /**
   * CSVファイルの '備考' 列に対応します。
   * 例: "急行", "深夜バス"
   */
  remarks?: string;

  /**
   * CSVファイル内の元の行番号（ヘッダー行を除くデータ行の1始まりの番号）。
   * CSVファイル自体には存在せず、パース時に内部的に付与されます。エラー報告やデバッグ時の参照に使用されます。
   */
  originalLineNumber: number;

  /**
   * このバスが出発間近または未来のものであるかを示します。
   * カウントダウンの対象選定などに利用できます。
   */
  isUpcoming?: boolean; 
}

export interface ParsedTimetableData {
  services: BusService[];
  routeIds: string[]; // アップロードされたファイル名（ルートID）のリスト
}

export interface TimeComparisonResult {
  isPast: boolean;
  isCurrent:boolean; // e.g. departing within next 5-10 mins
  isFuture: boolean;
}

export interface NextDepartureInfo {
  stopName: string;
  departureTime: string;
  remarks?: string;
  routeId: string;
}
