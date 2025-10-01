import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import WheelGesturesPlugin from "embla-carousel-wheel-gestures";
import { CopyIcon, PlusIcon, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { useSettingsStore, useTimelineStore, type SlideID, type TimelineSlide } from "~/lib/store";
import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "./ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "./ui/carousel";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "./ui/sheet";

function SlidesPanel() {
  const isDragging = useRef(false);
  const { enableSlidesPanel, onSettingChange } = useSettingsStore();
  const { slides, order, active, add, remove, duplicate } = useTimelineStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
        tolerance: 50,
      },
      onActivation({ event }) {
        isDragging.current = true;
      },
    })
  );

  const onOpenChange = (value: boolean) => {
    onSettingChange("enableSlidesPanel", value);
  };

  const onDragEnd = (event: DragEndEvent) => {
    isDragging.current = false;

    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = order.findIndex((id) => id === active.id);
      const newIndex = order.findIndex((id) => id === over.id);
      useTimelineStore.setState({ order: arrayMove(order, oldIndex, newIndex) });
    }
  };

  return (
    <Sheet modal={false} open={enableSlidesPanel} onOpenChange={onOpenChange} defaultOpen={enableSlidesPanel}>
      <SheetContent
        onInteractOutside={(e) => e.preventDefault()}
        side="bottom"
        aria-description="Slide editor"
        className="h-[13rem] outline-none px-2 w-full isolate z-40"
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SheetHeader className="flex justify-center items-end px-1 h-20">
            <SheetTitle className="mx-auto sr-only">Slide Editor</SheetTitle>
            <div className="flex items-center gap-2 pr-20"></div>
          </SheetHeader>
          <Carousel
            plugins={useMemo(() => [WheelGesturesPlugin()], [])}
            orientation="horizontal"
            className="w-full relative"
            opts={{
              align: "start",
              dragFree: true,
              watchDrag: () => !isDragging.current,
            }}
          >
            <CarouselContent className="px-4 overflow-visible! h-32 pr-10">
              <SortableContext items={order}>
                {order.map((id, index) => {
                  const slide = slides[id];
                  return (
                    <CarouselItem className="basis-[1/25%]" key={id}>
                      <Slide
                        onDelete={(id) => remove(id)}
                        onDuplicate={(id) => duplicate(id)}
                        item={slide}
                        isActive={active === slide.id}
                        order={index + 1}
                      />
                    </CarouselItem>
                  );
                })}
              </SortableContext>
              <div className="my-auto mx-5 flex flex-col gap-y-2">
                <Button size="icon" variant={"outline"} className="size-7" onClick={add}>
                  <PlusIcon />
                </Button>
              </div>
            </CarouselContent>
            <CarouselPrevious className="absolute left-0 bg-muted!" />
            <CarouselNext className="absolute right-0 bg-muted!" />
          </Carousel>
          <SheetFooter></SheetFooter>
        </DndContext>
      </SheetContent>
    </Sheet>
  );
}

const Slide: React.FC<{
  order: number;
  item: TimelineSlide;
  isActive: boolean;
  onDelete: (id: SlideID) => void;
  onDuplicate: (id: SlideID) => void;
}> = (props) => {
  const { attributes, setNodeRef, listeners, transform, transition, items } = useSortable({ id: props.item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const onClick = (e: React.MouseEvent) => {
    useTimelineStore.setState({ active: props.item.id });
  };

  return (
    <div
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        "relative aspect-video cursor-pointer select-none h-32 rounded-xl bg-muted/50 grid border-2 place-items-center focus-within:outline-primary outline-none",
        props.isActive ? "border-primary!" : "border-dashed"
      )}
    >
      <div className="flex absolute flex-col top-0 h-full right-0 gap-1 px-1 py-1">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            props.onDuplicate(props.item.id);
          }}
          size="icon"
          variant={"link"}
          className="size-8 text-white/50 hover:text-white"
        >
          <CopyIcon className="size-3.5" />
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete(props.item.id);
          }}
          size="icon"
          variant={"link"}
          className={cn("size-8 mt-auto text-destructive/80 hover:text-destructive", items.length <= 1 && "hidden")}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      Frame {props.order}
    </div>
  );
};

export default SlidesPanel;
