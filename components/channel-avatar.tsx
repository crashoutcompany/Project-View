import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ChannelAvatarProps = {
  title: string;
  thumbnailUrl: string;
  size?: "default" | "sm" | "lg";
  className?: string;
};

export function initials(label: string) {
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// Uses the thumbnail already returned with the channel (no extra API call)
// and falls back to initials while it loads or when there isn't one.
export function ChannelAvatar({
  title,
  thumbnailUrl,
  size = "lg",
  className,
}: ChannelAvatarProps) {
  return (
    <Avatar size={size} className={cn("shrink-0", className)}>
      {thumbnailUrl ? <AvatarImage src={thumbnailUrl} alt="" /> : null}
      <AvatarFallback className="text-xs font-medium">
        {initials(title)}
      </AvatarFallback>
    </Avatar>
  );
}
