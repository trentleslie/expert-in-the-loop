import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  MoreVertical, 
  Shield, 
  User as UserIcon,
  Search,
  Users
} from "lucide-react";
import { useState } from "react";
import type { User } from "@shared/schema";
import { format } from "date-fns";

type UserWithStats = User & {
  voteCount?: number;
};

function UserRow({ user, onUpdate }: { user: UserWithStats; onUpdate: () => void }) {
  const { toast } = useToast();

  const updateRoleMutation = useMutation({
    mutationFn: (role: string) => 
      apiRequest("PATCH", `/api/users/${user.id}/role`, { role }),
    onSuccess: () => {
      toast({ title: "Role updated" });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update role.", variant: "destructive" });
    },
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-primary">
              {user.displayName?.charAt(0) || user.email.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
          {user.role === "admin" ? (
            <><Shield className="w-3 h-3 mr-1" /> Admin</>
          ) : (
            <><UserIcon className="w-3 h-3 mr-1" /> Reviewer</>
          )}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-sm">
        {user.voteCount ?? 0}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {user.lastActive ? format(new Date(user.lastActive), "MMM d, yyyy") : "Never"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {user.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "-"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-user-menu-${user.id}`}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {user.role === "reviewer" ? (
              <DropdownMenuItem onClick={() => updateRoleMutation.mutate("admin")}>
                <Shield className="w-4 h-4 mr-2" />
                Promote to Admin
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => updateRoleMutation.mutate("reviewer")}>
                <UserIcon className="w-4 h-4 mr-2" />
                Demote to Reviewer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function AdminUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<UserWithStats[]>({
    queryKey: ["/api/users"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
  };

  const filteredUsers = users?.filter(user => 
    user.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const adminCount = users?.filter(u => u.role === "admin").length || 0;
  const reviewerCount = users?.filter(u => u.role === "reviewer").length || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                  <p className="text-xl font-semibold">{users?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Admins</p>
                  <p className="text-xl font-semibold">{adminCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted">
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reviewers</p>
                  <p className="text-xl font-semibold">{reviewerCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-users"
          />
        </div>

        {/* Users table */}
        <Card className="border-card-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : filteredUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Votes</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <UserRow key={user.id} user={user} onUpdate={handleRefresh} />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center py-12">
                <Users className="w-10 h-10 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "No users match your search" : "No users yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
