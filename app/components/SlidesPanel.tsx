import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import WheelGesturesPlugin from "embla-carousel-wheel-gestures";
import { CopyIcon, PlusIcon, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { useSettings } from "~/lib/settings";
import { addSlide, duplicateSlide, moveSlide, removeSlide, selectSlide, useSlides, type SlideID } from "~/lib/slides";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "./ui/carousel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

function SlidesPanel() {
  const isDragging = useRef(false);
  const { enableSlidesPanel, onSettingChange } = useSettings();
  const { order, active } = useSlides();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
        tolerance: 50,
      },
      onActivation() {
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

    if (over && active.id !== over.id) moveSlide(String(active.id), String(over.id));
  };

  return (
    <Sheet modal={false} open={enableSlidesPanel} onOpenChange={onOpenChange}>
      <SheetContent
        onInteractOutside={(e) => e.preventDefault()}
        side="bottom"
        aria-description="Slide editor"
        className="h-[13rem] outline-none px-2 w-full isolate z-40"
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SheetHeader className="flex justify-center items-end px-1 h-20">
            <SheetTitle className="mx-auto sr-only">Slide Editor</SheetTitle>
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
                {order.map((id, index) => (
                  <CarouselItem className="basis-[1/25%]" key={id}>
                    <Slide id={id} frame={index + 1} isActive={active === id} canDelete={order.length > 1} />
                  </CarouselItem>
                ))}
              </SortableContext>
              <div className="my-auto mx-5 flex flex-col gap-y-2">
                <Button size="icon" variant={"outline"} className="size-7" onClick={addSlide}>
                  <PlusIcon />
                </Button>
              </div>
            </CarouselContent>
            <CarouselPrevious className="absolute left-0 bg-muted!" />
            <CarouselNext className="absolute right-0 bg-muted!" />
          </Carousel>
        </DndContext>
      </SheetContent>
    </Sheet>
  );
}

const Slide: React.FC<{ id: SlideID; frame: number; isActive: boolean; canDelete: boolean }> = (props) => {
  const { attributes, setNodeRef, listeners, transform, transition } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      style={style}
      onClick={() => selectSlide(props.id)}
      className={cn(
        "relative aspect-video cursor-pointer select-none h-32 rounded-xl bg-muted/50 grid border-2 place-items-center focus-within:outline-primary outline-none",
        props.isActive ? "border-primary!" : "border-dashed"
      )}
    >
      <div className="flex absolute flex-col top-0 h-full right-0 gap-1 px-1 py-1">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            duplicateSlide(props.id);
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
            removeSlide(props.id);
          }}
          size="icon"
          variant={"link"}
          className={cn("size-8 mt-auto text-destructive/80 hover:text-destructive", !props.canDelete && "hidden")}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      Frame {props.frame}
    </div>
  );
};

export default SlidesPanel;
