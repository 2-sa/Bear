import { MarketSegmented, type SegmentedItem } from "./market/market-segmented";
import { BadgesRosetteIcon, DiscoverCompassIcon, ThemesDropIcon } from "./store-tab-icons";

export type StoreTab = "discover" | "themes" | "badges" | "awards";

const TABS: SegmentedItem[] = [
  { id: "discover", label: "Discover", icon: <DiscoverCompassIcon size={15} strokeWidth={2.2} /> },
  { id: "themes", label: "Themes", icon: <ThemesDropIcon size={15} strokeWidth={2.2} /> },
  { id: "badges", label: "Badge bundles", icon: <BadgesRosetteIcon size={15} strokeWidth={2.2} /> },
];

export function StoreTabs({
  active,
  onSelect,
  themesEnabled = true,
}: {
  active: StoreTab;
  onSelect: (t: StoreTab) => void;
  themesEnabled?: boolean;
}) {
  const items = themesEnabled ? TABS : TABS.filter((tab) => tab.id === "badges");
  return <MarketSegmented items={items} active={active} onSelect={(id) => onSelect(id as StoreTab)} />;
}
